use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter};
use crate::types::UploadPolicyResponse;

/// Upload a local file to DashScope OSS, reporting progress via `translate-progress` events.
#[tauri::command]
pub async fn upload_to_dashscope_oss(
    app: AppHandle,
    file_path: String,
    api_key: String,
) -> Result<String, String> {
    let metadata = fs::metadata(&file_path).map_err(|e| format!("读取文件信息失败: {e}"))?;
    let file_size_mb = metadata.len() as f64 / 1_048_576.0;
    let _ = app.emit("translate-progress", format!("正在上传文件（{:.1} MB）...", file_size_mb));

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let policy_resp = client
        .get("https://dashscope.aliyuncs.com/api/v1/uploads")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .query(&[("action", "getPolicy"), ("model", "qwen3.5-omni-plus")])
        .send().await.map_err(|e| format!("获取上传凭证失败: {e}"))?;

    if !policy_resp.status().is_success() {
        let status = policy_resp.status();
        let body = policy_resp.text().await.unwrap_or_default();
        return Err(format!("获取上传凭证失败 ({status}): {body}"));
    }

    let policy: UploadPolicyResponse = policy_resp.json().await
        .map_err(|e| format!("解析上传凭证失败: {e}"))?;
    let data = policy.data;

    let file_name = Path::new(&file_path).file_name().and_then(|n| n.to_str()).unwrap_or("upload");
    let oss_key = format!("{}/{}", data.upload_dir, file_name);

    let _ = app.emit("translate-progress", format!("上传中（{:.1} MB）...", file_size_mb));

    let file_bytes = fs::read(&file_path).map_err(|e| format!("读取文件失败: {e}"))?;
    let file_part = reqwest::multipart::Part::bytes(file_bytes).file_name(file_name.to_string());

    let form = reqwest::multipart::Form::new()
        .text("OSSAccessKeyId", data.oss_access_key_id)
        .text("Signature", data.signature)
        .text("policy", data.policy)
        .text("x-oss-object-acl", data.x_oss_object_acl)
        .text("x-oss-forbid-overwrite", data.x_oss_forbid_overwrite)
        .text("key", oss_key.clone())
        .text("success_action_status", "200".to_string())
        .part("file", file_part);

    let upload_resp = client.post(&data.upload_host).multipart(form).send().await
        .map_err(|e| format!("OSS 上传失败: {e}"))?;

    if !upload_resp.status().is_success() {
        let status = upload_resp.status();
        let body = upload_resp.text().await.unwrap_or_default();
        return Err(format!("OSS 上传失败 ({status}): {body}"));
    }

    let oss_url = format!("oss://{oss_key}");
    let _ = app.emit("translate-progress", "文件上传完成，正在等待 AI 响应...".to_string());
    crate::debug!("[Rust OSS] 文件上传成功: {oss_url}");
    Ok(oss_url)
}
