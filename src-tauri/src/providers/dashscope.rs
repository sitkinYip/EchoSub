pub const PROVIDER_ID: &str = "dashscope";
pub const DEFAULT_MODEL: &str = "qwen3.5-omni-plus";
pub const UPLOAD_POLICY_URL: &str = "https://dashscope.aliyuncs.com/api/v1/uploads";
pub const CHAT_COMPLETIONS_URL: &str =
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

pub fn upload_policy_query() -> [(&'static str, &'static str); 2] {
    [("action", "getPolicy"), ("model", DEFAULT_MODEL)]
}

pub fn build_chat_request_body(
    oss_url: &str,
    media_type: &str,
    source_lang: &str,
    target_lang: &str,
    prompt: &str,
) -> serde_json::Value {
    let is_video = media_type == "video";
    let ext = if is_video { "mp4" } else { "mp3" };
    let media_entry = if is_video {
        serde_json::json!({ "type": "video_url", "video_url": { "url": oss_url } })
    } else {
        serde_json::json!({ "type": "input_audio", "input_audio": { "data": oss_url, "format": ext } })
    };

    serde_json::json!({
        "model": DEFAULT_MODEL,
        "messages": [{
            "role": "user",
            "content": [media_entry, { "type": "text", "text": prompt }]
        }],
        "metadata": {
            "provider": PROVIDER_ID,
            "source_language": source_lang,
            "target_language": target_lang
        },
        "temperature": 0.1,
        "top_p": 0.1,
        "stream": true,
        "stream_options": { "include_usage": true },
        "modalities": ["text"]
    })
}

#[cfg(test)]
mod tests {
    use super::{build_chat_request_body, DEFAULT_MODEL, PROVIDER_ID};

    #[test]
    fn builds_audio_request_body() {
        let body = build_chat_request_body("oss://bucket/audio.mp3", "audio", "日语", "中文", "prompt");

        assert_eq!(body["model"], DEFAULT_MODEL);
        assert_eq!(body["metadata"]["provider"], PROVIDER_ID);
        assert_eq!(
            body["messages"][0]["content"][0]["input_audio"]["data"],
            "oss://bucket/audio.mp3"
        );
    }

    #[test]
    fn builds_video_request_body() {
        let body = build_chat_request_body("oss://bucket/video.mp4", "video", "英语", "中文", "prompt");

        assert_eq!(
            body["messages"][0]["content"][0]["video_url"]["url"],
            "oss://bucket/video.mp4"
        );
    }
}
