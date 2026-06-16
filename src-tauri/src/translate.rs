use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Listener};
use crate::types::TranslateRequest;
use crate::prompt::build_prompt;

/// Stream translate via DashScope SSE, emitting `translate-chunk` / `translate-done` / `translate-error`.
#[tauri::command]
pub async fn stream_translate(app: AppHandle, req: TranslateRequest) -> Result<(), String> {
    let is_video = req.media_type == "video";
    let prompt = build_prompt(&req.source_lang, &req.target_lang, is_video);
    let ext = if is_video { "mp4" } else { "mp3" };

    let media_entry = if is_video {
        serde_json::json!({ "type": "video_url", "video_url": { "url": req.oss_url } })
    } else {
        serde_json::json!({ "type": "input_audio", "input_audio": { "data": req.oss_url, "format": ext } })
    };

    let request_body = serde_json::json!({
        "model": "qwen3.5-omni-plus",
        "messages": [{
            "role": "user",
            "content": [media_entry, { "type": "text", "text": prompt }]
        }],
        "temperature": 0.1, "top_p": 0.1,
        "stream": true,
        "stream_options": { "include_usage": true },
        "modalities": ["text"]
    });

    let body = request_body.to_string();
    crate::debug!("===== [Rust stream] REQUEST =====");
    crate::debug!("model: qwen3.5-omni-plus");
    crate::debug!("source: {} → target: {}", req.source_lang, req.target_lang);
    crate::debug!("media_type: {}", req.media_type);
    crate::debug!("prompt ({} chars)", prompt.len());
    crate::debug!("===== [Rust stream] END REQUEST =====");

    let _ = app.emit("translate-progress", "AI 正在识别并翻译...");

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let response = client
        .post("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", req.api_key))
        .header("Content-Type", "application/json")
        .header("X-DashScope-OssResourceResolve", "enable")
        .body(body)
        .send().await.map_err(|e| format!("网络请求失败: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let err_body = response.text().await.unwrap_or_default();
        return Err(format!("API 请求失败 ({status}): {err_body}"));
    }

    use futures_util::StreamExt;
    use tokio::time::{timeout, Duration as TokioDuration};

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut chunk_count: u32 = 0;
    let mut raw_count: u32 = 0;
    let mut full_response = String::new();
    let cancelled = Arc::new(AtomicBool::new(false));
    let cancel_flag = cancelled.clone();

    let _ = app.once("translate-cancel", move |_| { cancel_flag.store(true, Ordering::SeqCst); });

    while let Some(item_result) = timeout(TokioDuration::from_secs(120), stream.next())
        .await.map_err(|_| "流读取超时（120 秒无数据）".to_string())?
    {
        let chunk = item_result.map_err(|e| format!("流读取错误: {e}"))?;

        if cancelled.load(Ordering::SeqCst) {
            let _ = app.emit("translate-error", "翻译已取消");
            return Err("翻译已取消".to_string());
        }

        let text = String::from_utf8_lossy(&chunk);
        let text_str = text.to_string();
        buffer.push_str(&text_str);

        raw_count += 1;
        if raw_count <= 5 || raw_count % 50 == 0 {
            let preview = if text_str.len() > 200 { &text_str[..200] } else { &text_str };
            crate::debug!("[Rust SSE raw #{raw_count}] {} bytes: {}", text_str.len(), preview.replace('\n', "\\n"));
        }

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim().to_string();
            buffer = buffer[pos + 1..].to_string();
            if line.is_empty() || !line.starts_with("data:") { continue; }

            let json_str = line[5..].trim().to_string();
            if json_str == "[DONE]" {
                crate::debug!("[Rust stream] DONE — {} chunks, {} chars", chunk_count, full_response.len());
                let _ = app.emit("translate-done", ());
                return Ok(());
            }

            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str) {
                if let Some(error) = parsed.get("error") {
                    let msg = error.get("message").and_then(|v| v.as_str()).unwrap_or("未知 API 错误");
                    crate::debug!("[Rust SSE] API ERROR: {}", msg);
                    let _ = app.emit("translate-error", msg.to_string());
                    return Err(msg.to_string());
                }
                if let Some(choices) = parsed["choices"].as_array() {
                    if let Some(delta) = choices.first().and_then(|c| c["delta"].as_object()) {
                        if let Some(content) = delta.get("content").and_then(|v| v.as_str()) {
                            chunk_count += 1;
                            full_response.push_str(content);
                            let _ = app.emit("translate-chunk", content.to_string());
                        }
                    }
                }
            }
        }
    }

    crate::debug!("[Rust stream] ended without [DONE] — {} chunks", chunk_count);
    if cancelled.load(Ordering::SeqCst) { return Err("翻译已取消".to_string()); }
    let _ = app.emit("translate-done", ());
    Ok(())
}
