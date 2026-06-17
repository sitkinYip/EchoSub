use tauri::{AppHandle, Emitter, State};

use crate::prompt::build_prompt;
use crate::providers::dashscope;
use crate::state::AppState;
use crate::types::{TaskEvent, TranslateRequest};

fn emit_task<T>(app: &AppHandle, event: &str, task_id: &str, payload: T)
where
    T: serde::Serialize + Clone,
{
    let _ = app.emit(
        event,
        TaskEvent {
            task_id: task_id.to_string(),
            payload,
        },
    );
}

/// Stream translate via DashScope SSE, emitting task-scoped events.
#[tauri::command]
pub async fn stream_translate(
    app: AppHandle,
    state: State<'_, AppState>,
    req: TranslateRequest,
) -> Result<(), String> {
    let task_id = req.task_id.clone();
    let is_video = req.media_type == "video";
    let prompt = build_prompt(&req.source_lang, &req.target_lang, is_video);

    let request_body =
        dashscope::build_chat_request_body(&req.oss_url, &req.media_type, &req.source_lang, &req.target_lang, &prompt);

    let body = request_body.to_string();
    crate::debug!("===== [Rust stream] REQUEST =====");
    crate::debug!("model: {}", dashscope::DEFAULT_MODEL);
    crate::debug!("source: {} → target: {}", req.source_lang, req.target_lang);
    crate::debug!("media_type: {}", req.media_type);
    crate::debug!("prompt ({} chars)", prompt.len());
    crate::debug!("===== [Rust stream] END REQUEST =====");

    emit_task(
        &app,
        "translate-progress",
        &task_id,
        "AI 正在识别并翻译...".to_string(),
    );

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    if state.is_cancelled(&task_id) {
        emit_task(&app, "translate-error", &task_id, "任务已取消".to_string());
        return Err("任务已取消".to_string());
    }

    let response = client
        .post(dashscope::CHAT_COMPLETIONS_URL)
        .header("Authorization", format!("Bearer {}", req.api_key))
        .header("Content-Type", "application/json")
        .header("X-DashScope-OssResourceResolve", "enable")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {e}"))?;

    if state.is_cancelled(&task_id) {
        emit_task(&app, "translate-error", &task_id, "任务已取消".to_string());
        return Err("任务已取消".to_string());
    }

    if !response.status().is_success() {
        let status = response.status();
        let err_body = response.text().await.unwrap_or_default();
        return Err(format!("API 请求失败 ({status}): {err_body}"));
    }

    use futures_util::StreamExt;
    use tokio::time::{timeout, Duration as TokioDuration};

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut _chunk_count: u32 = 0;
    let mut raw_count: u32 = 0;
    let mut _full_response = String::new();

    while let Some(item_result) = timeout(TokioDuration::from_secs(120), stream.next())
        .await
        .map_err(|_| "流读取超时（120 秒无数据）".to_string())?
    {
        if state.is_cancelled(&task_id) {
            emit_task(&app, "translate-error", &task_id, "任务已取消".to_string());
            return Err("任务已取消".to_string());
        }

        let chunk = item_result.map_err(|e| format!("流读取错误: {e}"))?;
        let text = String::from_utf8_lossy(&chunk);
        let text_str = text.to_string();
        buffer.push_str(&text_str);

        raw_count += 1;
        if raw_count <= 5 || raw_count.is_multiple_of(50) {
            let _preview = if text_str.len() > 200 {
                &text_str[..200]
            } else {
                &text_str
            };
            crate::debug!(
                "[Rust SSE raw #{raw_count}] {} bytes: {}",
                text_str.len(),
                _preview.replace('\n', "\\n")
            );
        }

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim().to_string();
            buffer = buffer[pos + 1..].to_string();
            if line.is_empty() || !line.starts_with("data:") {
                continue;
            }

            let json_str = line[5..].trim().to_string();
            if json_str == "[DONE]" {
                crate::debug!(
                    "[Rust stream] DONE — {} chunks, {} chars",
                    _chunk_count,
                    _full_response.len()
                );
                emit_task(&app, "translate-done", &task_id, ());
                return Ok(());
            }

            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str) {
                if let Some(error) = parsed.get("error") {
                    let msg = error
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("未知 API 错误");
                    crate::debug!("[Rust SSE] API ERROR: {}", msg);
                    emit_task(&app, "translate-error", &task_id, msg.to_string());
                    return Err(msg.to_string());
                }
                if let Some(choices) = parsed["choices"].as_array() {
                    if let Some(delta) = choices.first().and_then(|c| c["delta"].as_object()) {
                        if let Some(content) = delta.get("content").and_then(|v| v.as_str()) {
                            _chunk_count += 1;
                            _full_response.push_str(content);
                            emit_task(&app, "translate-chunk", &task_id, content.to_string());
                        }
                    }
                }
            }
        }
    }

    crate::debug!(
        "[Rust stream] ended without [DONE] — {} chunks",
        _chunk_count
    );
    if state.is_cancelled(&task_id) {
        return Err("任务已取消".to_string());
    }
    emit_task(&app, "translate-done", &task_id, ());
    Ok(())
}
