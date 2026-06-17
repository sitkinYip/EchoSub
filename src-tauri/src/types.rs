use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct FileInfo {
    pub size: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskEvent<T: Serialize + Clone> {
    pub task_id: String,
    pub payload: T,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateRequest {
    pub task_id: String,
    pub oss_url: String,
    pub api_key: String,
    pub media_type: String,
    pub source_lang: String,
    pub target_lang: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalPipelineRequest {
    pub task_id: String,
    pub wav_path: String,
    pub model_path: String,
    pub translate_model_path: Option<String>,
    pub api_key: Option<String>,
    pub source_lang: String,
    pub target_lang: String,
    pub translation_fallback: Option<String>,
}

#[derive(Deserialize)]
pub struct UploadPolicyData {
    pub upload_host: String,
    pub upload_dir: String,
    pub oss_access_key_id: String,
    pub signature: String,
    pub policy: String,
    pub x_oss_object_acl: String,
    pub x_oss_forbid_overwrite: String,
}

#[derive(Deserialize)]
pub struct UploadPolicyResponse {
    pub data: UploadPolicyData,
}
