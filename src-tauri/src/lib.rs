use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter};

// ── Types ────────────────────────────────────────────

#[derive(Serialize)]
struct FileInfo {
    size: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TranslateRequest {
    file_path: String,
    api_key: String,
    media_type: String, // "audio" | "video"
    source_lang: String,
    target_lang: String,
}

// ── Helpers ──────────────────────────────────────────

fn build_prompt(source_lang: &str, target_lang: &str, is_video: bool) -> String {
    let media_type = if is_video { "视频" } else { "音频" };
    let extra = if is_video {
        "请同时利用视频画面中的文字和语音信息，以获得更准确的字幕。"
    } else {
        ""
    };

    if source_lang == target_lang {
        format!(
            "请转录这段{source_lang}{media_type}并生成{target_lang}字幕，按句子分段给出时间戳。{extra}\n严格遵守标准 SRT 字幕格式输出，不要输出任何额外说明、Markdown 标记或解释性文字：\n\n序号\nHH:MM:SS,mmm --> HH:MM:SS,mmm\n{target_lang}文本\n\n示例：\n\n1\n00:00:00,000 --> 00:00:03,500\n你好，很高兴见到你。\n\n2\n00:00:03,500 --> 00:00:07,200\n今天天气真不错。"
        )
    } else {
        format!(
            "请识别这段{source_lang}{media_type}的内容，将其翻译成{target_lang}，并按句子分段给出时间戳。{extra}\n严格遵守标准 SRT 字幕格式输出，不要输出任何额外说明、Markdown 标记或解释性文字：\n\n序号\nHH:MM:SS,mmm --> HH:MM:SS,mmm\n{target_lang}文本\n\n示例（{source_lang} → {target_lang}）：\n\n1\n00:00:00,000 --> 00:00:03,500\n你好，很高兴见到你。\n\n2\n00:00:03,500 --> 00:00:07,200\n今天天气真不错。"
        )
    }
}

// ── OSS Upload (DashScope 临时文件上传) ──────────────

#[derive(Deserialize)]
struct UploadPolicyData {
    upload_host: String,
    upload_dir: String,
    oss_access_key_id: String,
    signature: String,
    policy: String,
    x_oss_object_acl: String,
    x_oss_forbid_overwrite: String,
}

#[derive(Deserialize)]
struct UploadPolicyResponse {
    data: UploadPolicyData,
}

/// 将本地文件上传到 DashScope 临时 OSS 存储，返回 `oss://` 前缀的临时 URL（有效期 48h）。
async fn upload_to_dashscope_oss(
    api_key: &str,
    model_name: &str,
    file_path: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    // 1. 获取上传凭证
    let policy_resp = client
        .get("https://dashscope.aliyuncs.com/api/v1/uploads")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .query(&[("action", "getPolicy"), ("model", model_name)])
        .send()
        .await
        .map_err(|e| format!("获取上传凭证失败: {e}"))?;

    if !policy_resp.status().is_success() {
        let status = policy_resp.status();
        let body = policy_resp.text().await.unwrap_or_default();
        return Err(format!("获取上传凭证失败 ({status}): {body}"));
    }

    let policy: UploadPolicyResponse = policy_resp
        .json()
        .await
        .map_err(|e| format!("解析上传凭证失败: {e}"))?;
    let data = policy.data;

    // 2. 上传文件到 OSS
    let file_name = Path::new(file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("upload");
    let oss_key = format!("{}/{}", data.upload_dir, file_name);

    let file_bytes = fs::read(file_path).map_err(|e| format!("读取文件失败: {e}"))?;
    let file_part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name(file_name.to_string());

    let form = reqwest::multipart::Form::new()
        .text("OSSAccessKeyId", data.oss_access_key_id)
        .text("Signature", data.signature)
        .text("policy", data.policy)
        .text("x-oss-object-acl", data.x_oss_object_acl)
        .text("x-oss-forbid-overwrite", data.x_oss_forbid_overwrite)
        .text("key", oss_key.clone())
        .text("success_action_status", "200".to_string())
        .part("file", file_part);

    let upload_resp = client
        .post(&data.upload_host)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("OSS 上传失败: {e}"))?;

    if !upload_resp.status().is_success() {
        let status = upload_resp.status();
        let body = upload_resp.text().await.unwrap_or_default();
        return Err(format!("OSS 上传失败 ({status}): {body}"));
    }

    let oss_url = format!("oss://{oss_key}");
    eprintln!("[Rust OSS] 文件上传成功: {oss_url}");
    Ok(oss_url)
}

// ── Commands ─────────────────────────────────────────

#[tauri::command]
fn get_file_info(path: String) -> Result<FileInfo, String> {
    let metadata = fs::metadata(&path).map_err(|e| format!("读取文件信息失败: {e}"))?;
    Ok(FileInfo {
        size: metadata.len(),
    })
}

#[tauri::command]
fn read_audio_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("读取文件失败: {e}"))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

/// Rust 后端流式翻译：读取文件 → (小文件 base64 / 大文件 OSS 上传) → POST DashScope → 通过事件流式返回文本
#[tauri::command]
async fn stream_translate_file(
    app: AppHandle,
    req: TranslateRequest,
) -> Result<(), String> {
    let file_path = req.file_path;
    let api_key = req.api_key;
    let is_video = req.media_type == "video";

    // 1. 上传文件到 OSS 获取临时 URL
    let ext = file_path
        .rsplit('.')
        .next()
        .unwrap_or("mp3")
        .to_lowercase();

    let metadata = fs::metadata(&file_path).map_err(|e| format!("读取文件信息失败: {e}"))?;
    let file_size_mb = metadata.len() as f64 / 1_048_576.0;
    eprintln!("[Rust stream] file={}, size={:.1} MB — 上传到 OSS", file_path, file_size_mb);

    let _ = app.emit("translate-progress", format!("正在上传文件到云端（{:.1} MB）...", file_size_mb));
    let file_url = upload_to_dashscope_oss(&api_key, "qwen3.5-omni-plus", &file_path).await?;

    let _ = app.emit("translate-progress", "文件上传完成，正在等待 AI 响应...".to_string());

    // 2. 构建 prompt
    let prompt = build_prompt(&req.source_lang, &req.target_lang, is_video);

    // 3. 使用 serde_json 构建请求体
    let media_entry = if is_video {
        serde_json::json!({
            "type": "video_url",
            "video_url": { "url": file_url }
        })
    } else {
        serde_json::json!({
            "type": "input_audio",
            "input_audio": { "data": file_url, "format": ext }
        })
    };

    let request_body = serde_json::json!({
        "model": "qwen3.5-omni-plus",
        "messages": [{
            "role": "user",
            "content": [
                media_entry,
                { "type": "text", "text": prompt }
            ]
        }],
        "stream": true,
        "stream_options": { "include_usage": true },
        "modalities": ["text"]
    });

    let body = request_body.to_string();

    // 打印请求体结构（截断 base64 部分）用于调试
    if body.len() > 2000 {
        eprintln!("[Rust stream] request body ({:.1} MB): {}...(truncated)", body.len() as f64 / 1_048_576.0, &body[..500]);
    } else {
        eprintln!("[Rust stream] request body ({:.1} MB): {}", body.len() as f64 / 1_048_576.0, body);
    }

    // 4. 发送 HTTP 请求
    let client = reqwest::Client::new();
    let response = client
        .post("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .header("X-DashScope-OssResourceResolve", "enable")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let err_body = response.text().await.unwrap_or_default();
        return Err(format!("API 请求失败 ({status}): {err_body}"));
    }

    // 5. 流式读取响应，逐 chunk 发送到前端
    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut chunk_count: u32 = 0;

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("流读取错误: {e}"))?;
        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        // 解析 SSE 行
        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim().to_string();
            buffer = buffer[pos + 1..].to_string();

            if line.is_empty() || !line.starts_with("data:") {
                continue;
            }

            let json_str = line[5..].trim().to_string();

            if json_str == "[DONE]" {
                eprintln!("[Rust stream] done, {} chunks sent", chunk_count);
                let _ = app.emit("translate-done", ());
                return Ok(());
            }

            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str)
            {
                if let Some(choices) = parsed["choices"].as_array() {
                    if let Some(delta) = choices.first().and_then(|c| c["delta"].as_object())
                    {
                        if let Some(content) = delta.get("content").and_then(|v| v.as_str()) {
                            chunk_count += 1;
                            let _ = app.emit("translate-chunk", content.to_string());
                        }
                    }
                }
                if let Some(usage) = parsed.get("usage") {
                    eprintln!("[Rust stream] token usage: {usage}");
                }
            }
        }
    }

    eprintln!("[Rust stream] stream ended, {} chunks", chunk_count);
    let _ = app.emit("translate-done", ());
    Ok(())
}

// ── App entry ────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            read_audio_base64,
            get_file_info,
            stream_translate_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
