use std::fs;
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::AsyncWriteExt;

use crate::state::AppState;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperModel {
    pub id: &'static str,
    pub file_name: &'static str,
    pub label: &'static str,
    pub size_mb: u32,
    pub language: &'static str,
    pub url: &'static str,
    pub recommended: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateModel {
    pub id: &'static str,
    pub file_name: &'static str,
    pub label: &'static str,
    pub size_mb: u32,
    pub language: &'static str,
    pub url: &'static str,
    pub recommended: bool,
    pub note: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalWhisperModel {
    pub id: String,
    pub file_name: String,
    pub path: String,
    pub size: u64,
    pub label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTranslateModel {
    pub id: String,
    pub file_name: String,
    pub path: String,
    pub size: u64,
    pub label: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelDownloadProgress {
    id: String,
    downloaded: u64,
    total: Option<u64>,
    percent: Option<u8>,
}

const WHISPER_MODELS: &[WhisperModel] = &[
    WhisperModel {
        id: "tiny",
        file_name: "ggml-tiny.bin",
        label: "Tiny",
        size_mb: 75,
        language: "多语言",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
        recommended: false,
    },
    WhisperModel {
        id: "base",
        file_name: "ggml-base.bin",
        label: "Base",
        size_mb: 142,
        language: "多语言",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
        recommended: true,
    },
    WhisperModel {
        id: "small",
        file_name: "ggml-small.bin",
        label: "Small",
        size_mb: 466,
        language: "多语言",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
        recommended: false,
    },
    WhisperModel {
        id: "base-en",
        file_name: "ggml-base.en.bin",
        label: "Base English",
        size_mb: 142,
        language: "英语",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
        recommended: false,
    },
];

const TRANSLATE_MODELS: &[TranslateModel] = &[
    TranslateModel {
        id: "qwen3-4b-instruct-q4",
        file_name: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        label: "Qwen3 4B Instruct Q4",
        size_mb: 2600,
        language: "多语言",
        url: "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        recommended: true,
        note: "质量优先，适合日/中/韩/英字幕翻译",
    },
    TranslateModel {
        id: "qwen3-1-7b-q4",
        file_name: "Qwen3-1.7B-Q4_K_M.gguf",
        label: "Qwen3 1.7B Q4",
        size_mb: 1200,
        language: "多语言",
        url: "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf",
        recommended: false,
        note: "轻量优先，低配机器更容易运行",
    },
];

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取数据目录: {e}"))?
        .join("models");
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建模型目录: {e}"))?;
    Ok(dir)
}

fn translate_models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取数据目录: {e}"))?
        .join("llm-models");
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建翻译模型目录: {e}"))?;
    Ok(dir)
}

fn find_model(id: &str) -> Result<&'static WhisperModel, String> {
    WHISPER_MODELS
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| format!("未知 Whisper 模型: {id}"))
}

fn find_translate_model(id: &str) -> Result<&'static TranslateModel, String> {
    TRANSLATE_MODELS
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| format!("未知字幕翻译模型: {id}"))
}

fn local_model_path(app: &AppHandle, model: &WhisperModel) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(model.file_name))
}

fn local_translate_model_path(app: &AppHandle, model: &TranslateModel) -> Result<PathBuf, String> {
    Ok(translate_models_dir(app)?.join(model.file_name))
}

fn normalize_model_path(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let normalized = Path::new(path)
        .canonicalize()
        .map_err(|e| format!("模型路径无效: {e}"))?;
    let dir = models_dir(app)?
        .canonicalize()
        .map_err(|e| format!("模型目录无效: {e}"))?;
    if !normalized.starts_with(&dir) {
        return Err("拒绝访问模型目录之外的文件".to_string());
    }
    if normalized.extension().and_then(|e| e.to_str()) != Some("bin") {
        return Err("只允许管理 .bin 模型文件".to_string());
    }
    Ok(normalized)
}

fn normalize_translate_model_path(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let normalized = Path::new(path)
        .canonicalize()
        .map_err(|e| format!("翻译模型路径无效: {e}"))?;
    let dir = translate_models_dir(app)?
        .canonicalize()
        .map_err(|e| format!("翻译模型目录无效: {e}"))?;
    if !normalized.starts_with(&dir) {
        return Err("拒绝访问翻译模型目录之外的文件".to_string());
    }
    if normalized.extension().and_then(|e| e.to_str()) != Some("gguf") {
        return Err("只允许管理 .gguf 翻译模型文件".to_string());
    }
    Ok(normalized)
}

fn local_label(file_name: &str) -> String {
    WHISPER_MODELS
        .iter()
        .find(|m| m.file_name == file_name)
        .map(|m| m.label.to_string())
        .unwrap_or_else(|| file_name.trim_end_matches(".bin").to_string())
}

fn local_translate_label(file_name: &str) -> String {
    TRANSLATE_MODELS
        .iter()
        .find(|m| m.file_name == file_name)
        .map(|m| m.label.to_string())
        .unwrap_or_else(|| file_name.trim_end_matches(".gguf").to_string())
}

async fn download_model_file(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    url: &str,
    final_path: PathBuf,
    cancel_prefix: &str,
) -> Result<String, String> {
    if final_path.is_file() {
        return Ok(final_path.to_string_lossy().to_string());
    }

    let tmp_path = final_path.with_extension("part");
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;
    crate::debug!("[model-download] start id={id} url={url}");
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("下载模型失败: {e}; url={url}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let preview = body.chars().take(300).collect::<String>();
        crate::debug!("[model-download] http error id={id} status={status} body={preview}");
        return Err(format!("下载模型失败 ({status}): {preview}; url={url}"));
    }

    let total = response.content_length();
    let mut downloaded = 0_u64;
    let mut last_percent: Option<u8> = None;
    let mut file = tokio::fs::File::create(&tmp_path)
        .await
        .map_err(|e| format!("无法创建模型文件: {e}"))?;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        if state.is_cancelled(&format!("{cancel_prefix}-{id}")) {
            let _ = tokio::fs::remove_file(&tmp_path).await;
            return Err("模型下载已取消".to_string());
        }
        let chunk = chunk.map_err(|e| format!("读取模型数据失败: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("写入模型失败: {e}"))?;
        downloaded += chunk.len() as u64;
        let percent = total.map(|v| ((downloaded.saturating_mul(100) / v).min(100)) as u8);
        if percent != last_percent {
            last_percent = percent;
            let _ = app.emit(
                "model-download-progress",
                ModelDownloadProgress {
                    id: id.clone(),
                    downloaded,
                    total,
                    percent,
                },
            );
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("刷新模型文件失败: {e}"))?;
    drop(file);
    tokio::fs::rename(&tmp_path, &final_path)
        .await
        .map_err(|e| format!("保存模型失败: {e}"))?;
    let _ = app.emit(
        "model-download-progress",
        ModelDownloadProgress {
            id,
            downloaded,
            total,
            percent: Some(100),
        },
    );
    Ok(final_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_whisper_models() -> Vec<WhisperModel> {
    WHISPER_MODELS.to_vec()
}

#[tauri::command]
pub fn list_translate_models() -> Vec<TranslateModel> {
    TRANSLATE_MODELS.to_vec()
}

#[tauri::command]
pub fn get_local_whisper_models(app: AppHandle) -> Result<Vec<LocalWhisperModel>, String> {
    let dir = models_dir(&app)?;
    let mut models = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("读取模型目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("读取模型文件失败: {e}"))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("bin") {
            continue;
        }
        let meta = entry
            .metadata()
            .map_err(|e| format!("读取模型文件信息失败: {e}"))?;
        if !meta.is_file() {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        let id = WHISPER_MODELS
            .iter()
            .find(|m| m.file_name == file_name)
            .map(|m| m.id.to_string())
            .unwrap_or_else(|| file_name.trim_end_matches(".bin").to_string());
        models.push(LocalWhisperModel {
            id,
            label: local_label(&file_name),
            file_name,
            path: path.to_string_lossy().to_string(),
            size: meta.len(),
        });
    }
    models.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    Ok(models)
}

#[tauri::command]
pub fn get_local_translate_models(app: AppHandle) -> Result<Vec<LocalTranslateModel>, String> {
    let dir = translate_models_dir(&app)?;
    let mut models = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("读取翻译模型目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("读取翻译模型文件失败: {e}"))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("gguf") {
            continue;
        }
        let meta = entry
            .metadata()
            .map_err(|e| format!("读取翻译模型文件信息失败: {e}"))?;
        if !meta.is_file() {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        let id = TRANSLATE_MODELS
            .iter()
            .find(|m| m.file_name == file_name)
            .map(|m| m.id.to_string())
            .unwrap_or_else(|| file_name.trim_end_matches(".gguf").to_string());
        models.push(LocalTranslateModel {
            id,
            label: local_translate_label(&file_name),
            file_name,
            path: path.to_string_lossy().to_string(),
            size: meta.len(),
        });
    }
    models.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    Ok(models)
}

#[tauri::command]
pub fn check_whisper_model_exists(app: AppHandle, id: String) -> Result<bool, String> {
    let model = find_model(&id)?;
    Ok(local_model_path(&app, model)?.is_file())
}

#[tauri::command]
pub fn check_translate_model_exists(app: AppHandle, id: String) -> Result<bool, String> {
    let model = find_translate_model(&id)?;
    Ok(local_translate_model_path(&app, model)?.is_file())
}

#[tauri::command]
pub async fn download_whisper_model(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<String, String> {
    let model = find_model(&id)?;
    let final_path = local_model_path(&app, model)?;
    download_model_file(app, state, id, model.url, final_path, "model-download").await
}

/// Silero VAD 模型常量。用于本地 ASR 前置的语音活动检测，
/// 让 whisper.cpp 在推理前跳过纯音乐/无人声段，过滤 [音乐] 等非语音内容。
/// ~2MB，与 Whisper 主模型同放 app_data_dir/models 目录。
///
/// 仓库与文件名以 whisper.cpp 官方脚本 models/download-vad-model.sh 为准：
///   src=https://huggingface.co/ggml-org/whisper-vad ，文件 ggml-silero-v5.1.2.bin。
/// 直连 HuggingFace 在部分网络环境下会被 DNS 污染/阻断，因此保留 hf-mirror 镜像作为备用源。
const VAD_MODEL_FILE: &str = "ggml-silero-v5.1.2.bin";
const VAD_MODEL_URLS: [&str; 2] = [
    "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin",
    "https://hf-mirror.com/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin",
];

#[tauri::command]
pub fn check_vad_model_exists(app: AppHandle) -> Result<bool, String> {
    Ok(models_dir(&app)?.join(VAD_MODEL_FILE).is_file())
}

#[tauri::command]
pub async fn download_vad_model(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let final_path = models_dir(&app)?.join(VAD_MODEL_FILE);

    // HuggingFace 直连在部分网络环境（DNS 污染/连接阻断）下不可达，
    // 故依次尝试主源与镜像源，任一成功即返回；全部失败时回传最后一次错误。
    let mut last_err = String::new();
    for url in VAD_MODEL_URLS.iter() {
        crate::debug!("[vad-download] 尝试源: {url}");
        match download_model_file(
            app.clone(),
            state.clone(),
            "vad".to_string(),
            url,
            final_path.clone(),
            "model-download",
        )
        .await
        {
            Ok(path) => return Ok(path),
            Err(e) => {
                crate::debug!("[vad-download] 源 {url} 失败: {e}");
                last_err = e;
            }
        }
    }
    Err(format!(
        "VAD 模型下载失败（已尝试全部镜像源）：{last_err}"
    ))
}

#[tauri::command]
pub async fn download_translate_model(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<String, String> {
    let model = find_translate_model(&id)?;
    let final_path = local_translate_model_path(&app, model)?;
    download_model_file(
        app,
        state,
        id,
        model.url,
        final_path,
        "translate-model-download",
    )
    .await
}

#[tauri::command]
pub fn delete_whisper_model(app: AppHandle, path: String) -> Result<(), String> {
    let normalized = normalize_model_path(&app, &path)?;
    if normalized.is_file() {
        fs::remove_file(&normalized).map_err(|e| format!("删除模型失败: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_translate_model(app: AppHandle, path: String) -> Result<(), String> {
    let normalized = normalize_translate_model_path(&app, &path)?;
    if normalized.is_file() {
        fs::remove_file(&normalized).map_err(|e| format!("删除翻译模型失败: {e}"))?;
    }
    Ok(())
}
