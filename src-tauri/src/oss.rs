use crate::providers::dashscope;
use crate::state::AppState;
use crate::types::{TaskEvent, UploadPolicyResponse};
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

fn is_cancelled(tasks: &Arc<Mutex<std::collections::HashSet<String>>>, task_id: &str) -> bool {
    tasks
        .lock()
        .map(|set| set.contains(task_id))
        .unwrap_or(false)
}

fn emit_progress(app: &AppHandle, task_id: &str, payload: impl Into<String>) {
    let _ = app.emit(
        "translate-progress",
        TaskEvent {
            task_id: task_id.to_string(),
            payload: payload.into(),
        },
    );
}

/// Upload a local file to DashScope OSS, reporting progress via `translate-progress` events.
#[tauri::command]
pub async fn upload_to_dashscope_oss(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    file_path: String,
    api_key: String,
) -> Result<String, String> {
    state.clear_task(&task_id);
    let cancelled_tasks = state.cancelled_tasks();
    let metadata = fs::metadata(&file_path).map_err(|e| format!("读取文件信息失败: {e}"))?;
    let file_len = metadata.len();
    let file_size_mb = metadata.len() as f64 / 1_048_576.0;
    emit_progress(
        &app,
        &task_id,
        format!("正在上传文件（{:.1} MB）...", file_size_mb),
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let policy_resp = client
        .get(dashscope::UPLOAD_POLICY_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .query(&dashscope::upload_policy_query())
        .send()
        .await
        .map_err(|e| format!("获取上传凭证失败: {e}"))?;

    if is_cancelled(&cancelled_tasks, &task_id) {
        return Err("任务已取消".to_string());
    }

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

    let file_name = Path::new(&file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("upload");
    let oss_key = format!("{}/{}", data.upload_dir, file_name);

    emit_progress(
        &app,
        &task_id,
        format!("上传中（{:.1} MB）...", file_size_mb),
    );

    let file = tokio::fs::File::open(&file_path)
        .await
        .map_err(|e| format!("读取文件失败: {e}"))?;
    let reader_stream = tokio_util::io::ReaderStream::new(file);
    use futures_util::StreamExt;
    let task_id_for_stream = task_id.clone();
    let cancelled_for_stream = Arc::clone(&cancelled_tasks);
    let guarded_stream = reader_stream.map(move |chunk| {
        if is_cancelled(&cancelled_for_stream, &task_id_for_stream) {
            Err(std::io::Error::new(
                std::io::ErrorKind::Interrupted,
                "任务已取消",
            ))
        } else {
            chunk
        }
    });
    let body = reqwest::Body::wrap_stream(guarded_stream);
    let file_part = reqwest::multipart::Part::stream_with_length(body, file_len)
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

    if is_cancelled(&cancelled_tasks, &task_id) {
        return Err("任务已取消".to_string());
    }

    if !upload_resp.status().is_success() {
        let status = upload_resp.status();
        let body = upload_resp.text().await.unwrap_or_default();
        return Err(format!("OSS 上传失败 ({status}): {body}"));
    }

    let oss_url = format!("oss://{oss_key}");
    emit_progress(&app, &task_id, "文件上传完成，正在等待 AI 响应...");
    crate::debug!("[Rust OSS] 文件上传成功: {oss_url}");
    Ok(oss_url)
}
