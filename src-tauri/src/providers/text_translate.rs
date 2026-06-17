use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};

use crate::providers::dashscope;
use crate::state::AppState;
use crate::types::TaskEvent;

#[derive(Debug)]
pub enum TextTranslateError {
    Cancelled,
    DataInspectionFailed(String),
    Request(String),
    Api(String),
    Stream(String),
}

impl std::fmt::Display for TextTranslateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TextTranslateError::Cancelled => write!(f, "任务已取消"),
            TextTranslateError::DataInspectionFailed(msg) => write!(f, "{msg}"),
            TextTranslateError::Request(msg)
            | TextTranslateError::Api(msg)
            | TextTranslateError::Stream(msg) => write!(f, "{msg}"),
        }
    }
}

impl std::error::Error for TextTranslateError {}

pub fn is_data_inspection_failed(text: &str) -> bool {
    text.contains("DataInspectionFailed")
        || text.contains("data inspection")
        || text.contains("inappropriate content")
        || text.contains("内容审核")
}

fn redact_api_key(api_key: &str) -> String {
    let trimmed = api_key.trim();
    if trimmed.len() <= 8 {
        return format!("*** ({} chars)", trimmed.len());
    }
    format!(
        "{}***{} ({} chars)",
        &trimmed[..3],
        &trimmed[trimmed.len() - 4..],
        trimmed.len()
    )
}

fn summarize_reqwest_error(err: &reqwest::Error) -> String {
    let mut parts = vec![err.to_string()];
    if err.is_timeout() {
        parts.push("timeout=true".to_string());
    }
    if err.is_connect() {
        parts.push("connect=true".to_string());
    }
    if err.is_request() {
        parts.push("request=true".to_string());
    }
    if err.is_body() {
        parts.push("body=true".to_string());
    }
    if let Some(status) = err.status() {
        parts.push(format!("status={status}"));
    }
    if let Some(source) = std::error::Error::source(err) {
        parts.push(format!("source={source}"));
    }
    parts.join("; ")
}

fn preview_chars(text: &str, max_chars: usize) -> String {
    let mut preview = String::new();
    for (count, ch) in text.chars().enumerate() {
        if count >= max_chars {
            let remaining = text.chars().count().saturating_sub(max_chars);
            preview.push_str(&format!("...<truncated {remaining} chars>"));
            break;
        }
        preview.push(ch);
    }
    preview
}

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

fn build_text_translate_prompt(srt_text: &str, source_lang: &str, target_lang: &str) -> String {
    format!(
        "请把下面的 SRT 字幕从{source_lang}翻译成{target_lang}。\n\
         严格保持 SRT 编号、时间轴、空行和字幕块结构，只翻译字幕正文。\n\
         不要解释，不要添加 Markdown，不要输出代码块。\n\n{srt_text}"
    )
}

fn build_text_request_body(
    srt_text: &str,
    source_lang: &str,
    target_lang: &str,
) -> serde_json::Value {
    serde_json::json!({
        "model": dashscope::DEFAULT_MODEL,
        "messages": [{
            "role": "user",
            "content": [{
                "type": "text",
                "text": build_text_translate_prompt(srt_text, source_lang, target_lang)
            }]
        }],
        "metadata": {
            "provider": dashscope::PROVIDER_ID,
            "source_language": source_lang,
            "target_language": target_lang,
            "mode": "local_whisper_text_translate"
        },
        "temperature": 0.1,
        "top_p": 0.1,
        "stream": true,
        "stream_options": { "include_usage": true },
        "modalities": ["text"]
    })
}

pub async fn stream_text_translate(
    app: AppHandle,
    state: AppState,
    task_id: String,
    srt_text: String,
    source_lang: String,
    target_lang: String,
    api_key: String,
) -> Result<(), TextTranslateError> {
    emit_task(
        &app,
        "translate-progress",
        &task_id,
        "正在翻译本地识别字幕...".to_string(),
    );

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| TextTranslateError::Request(format!("创建 HTTP 客户端失败: {e}")))?;
    let request_body = build_text_request_body(&srt_text, &source_lang, &target_lang);
    let body = request_body.to_string();
    let body_preview = preview_chars(&body, 1200);
    crate::debug!("===== [Rust local text translate] REQUEST =====");
    crate::debug!("url: {}", dashscope::CHAT_COMPLETIONS_URL);
    crate::debug!("model: {}", dashscope::DEFAULT_MODEL);
    crate::debug!("source: {} → target: {}", source_lang, target_lang);
    crate::debug!("api_key: {}", redact_api_key(&api_key));
    crate::debug!("source_srt_chars: {}", srt_text.chars().count());
    crate::debug!("body_bytes: {}", body.len());
    crate::debug!("body_preview: {}", body_preview.replace('\n', "\\n"));
    crate::debug!("===== [Rust local text translate] END REQUEST =====");

    let response = client
        .post(dashscope::CHAT_COMPLETIONS_URL)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| {
            let detail = summarize_reqwest_error(&e);
            crate::debug!("[Rust local text translate] send error: {detail}");
            TextTranslateError::Request(format!("文本翻译请求失败: {detail}"))
        })?;

    if state.is_cancelled(&task_id) {
        emit_task(&app, "translate-error", &task_id, "任务已取消".to_string());
        return Err(TextTranslateError::Cancelled);
    }

    if !response.status().is_success() {
        let status = response.status();
        let err_body = response.text().await.unwrap_or_default();
        crate::debug!(
            "[Rust local text translate] HTTP error {status}: {}",
            err_body.replace('\n', "\\n")
        );
        let msg = format!("文本翻译失败 ({status}): {err_body}");
        if is_data_inspection_failed(&msg) {
            return Err(TextTranslateError::DataInspectionFailed(msg));
        }
        return Err(TextTranslateError::Api(msg));
    }

    crate::debug!("[Rust local text translate] response status: success");

    use tokio::time::{timeout, Duration as TokioDuration};

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut raw_count: u32 = 0;
    let mut chunk_count: u32 = 0;
    let mut full_response_chars: usize = 0;

    while let Some(item_result) = timeout(TokioDuration::from_secs(120), stream.next())
        .await
        .map_err(|_| TextTranslateError::Stream("文本翻译流读取超时（120 秒无数据）".to_string()))?
    {
        if state.is_cancelled(&task_id) {
            emit_task(&app, "translate-error", &task_id, "任务已取消".to_string());
            return Err(TextTranslateError::Cancelled);
        }

        let chunk = item_result
            .map_err(|e| TextTranslateError::Stream(format!("文本翻译流读取错误: {e}")))?;
        let text = String::from_utf8_lossy(&chunk);
        let text_str = text.to_string();
        buffer.push_str(&text_str);

        raw_count += 1;
        if raw_count <= 5 || raw_count.is_multiple_of(50) {
            let preview = preview_chars(&text_str, 300);
            crate::debug!(
                "[Rust local text translate SSE raw #{raw_count}] {} bytes: {}",
                text_str.len(),
                preview.replace('\n', "\\n")
            );
        }

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim().to_string();
            buffer = buffer[pos + 1..].to_string();
            if line.is_empty() || !line.starts_with("data:") {
                continue;
            }

            let json_str = line[5..].trim();
            if json_str == "[DONE]" {
                crate::debug!(
                    "[Rust local text translate] DONE — {} chunks, {} chars",
                    chunk_count,
                    full_response_chars
                );
                emit_task(&app, "translate-done", &task_id, ());
                return Ok(());
            }

            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
                if let Some(error) = parsed.get("error") {
                    let msg = error
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("未知 API 错误");
                    if is_data_inspection_failed(msg) {
                        return Err(TextTranslateError::DataInspectionFailed(msg.to_string()));
                    }
                    return Err(TextTranslateError::Api(msg.to_string()));
                }
                if let Some(choices) = parsed["choices"].as_array() {
                    if let Some(delta) = choices.first().and_then(|c| c["delta"].as_object()) {
                        if let Some(content) = delta.get("content").and_then(|v| v.as_str()) {
                            chunk_count += 1;
                            full_response_chars += content.chars().count();
                            emit_task(&app, "translate-chunk", &task_id, content.to_string());
                        }
                    }
                }
            }
        }
    }

    crate::debug!(
        "[Rust local text translate] stream ended without [DONE] — {} chunks",
        chunk_count
    );
    emit_task(&app, "translate-done", &task_id, ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{build_text_translate_prompt, is_data_inspection_failed};

    #[test]
    fn prompt_keeps_srt_structure_instruction() {
        let prompt =
            build_text_translate_prompt("1\n00:00:00,000 --> 00:00:01,000\nHi\n", "英语", "中文");
        assert!(prompt.contains("严格保持 SRT"));
        assert!(prompt.contains("Hi"));
    }

    #[test]
    fn detects_dashscope_data_inspection_failure() {
        assert!(is_data_inspection_failed(
            "<400> InternalError.Algo.DataInspectionFailed: Output data may contain inappropriate content."
        ));
        assert!(!is_data_inspection_failed("文本翻译请求失败: connect=true"));
    }
}
