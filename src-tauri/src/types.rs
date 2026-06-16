use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct FileInfo {
    pub size: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateRequest {
    pub oss_url: String,
    pub api_key: String,
    pub media_type: String,
    pub source_lang: String,
    pub target_lang: String,
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
