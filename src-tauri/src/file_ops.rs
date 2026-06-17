use crate::state::AppState;
use crate::types::FileInfo;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager, State};

const FINGERPRINT_SAMPLE_SIZE: u64 = 1024 * 1024;

fn sanitize_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 128
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("非法文件 ID".to_string());
    }
    Ok(())
}

fn normalize_path(path: &str) -> Result<PathBuf, String> {
    Path::new(path)
        .canonicalize()
        .map_err(|e| format!("路径无效: {e}"))
}

fn subtitles_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取数据目录: {e}"))?;
    let subtitles_dir = dir.join("subtitles");
    fs::create_dir_all(&subtitles_dir).map_err(|e| format!("无法创建字幕目录: {e}"))?;
    Ok(subtitles_dir)
}

fn api_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取数据目录: {e}"))?;
    let conf_dir = dir.join("conf");
    fs::create_dir_all(&conf_dir).map_err(|e| format!("无法创建配置目录: {e}"))?;
    let path = conf_dir.join("api_key");

    // Set permission 0o600 (owner read/write only)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(path)
}

// ── File-based API key storage with OS-level permissions ──
// The key is stored at <app_data>/conf/api_key with 0o600 permissions
// (only the current user can read/write). Not in version control, not
// in the app bundle.

#[tauri::command]
pub fn save_api_key(app: AppHandle, key: String) -> Result<(), String> {
    let path = api_key_path(&app)?;
    if key.is_empty() {
        if path.exists() {
            fs::remove_file(&path).map_err(|e| format!("删除 API Key 失败: {e}"))?;
        }
    } else {
        let mut f = fs::File::create(&path).map_err(|e| format!("无法创建配置文件: {e}"))?;
        f.write_all(key.as_bytes())
            .map_err(|e| format!("写入失败: {e}"))?;
        // Re-apply permissions after write
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn load_api_key(app: AppHandle) -> Result<String, String> {
    let path = api_key_path(&app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    let bytes = fs::read(&path).map_err(|e| format!("读取失败: {e}"))?;
    String::from_utf8(bytes).map_err(|e| format!("解码失败: {e}"))
}

#[tauri::command]
pub fn get_file_info(path: String) -> Result<FileInfo, String> {
    let metadata = fs::metadata(&path).map_err(|e| format!("读取文件信息失败: {e}"))?;
    Ok(FileInfo {
        size: metadata.len(),
    })
}

#[tauri::command]
pub async fn calculate_file_hash(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let normalized = normalize_path(&path)?;
        let metadata = fs::metadata(&normalized).map_err(|e| format!("读取文件信息失败: {e}"))?;
        if !metadata.is_file() {
            return Err("只能为普通文件生成指纹".to_string());
        }

        let mut file =
            fs::File::open(&normalized).map_err(|e| format!("无法打开文件生成指纹: {e}"))?;
        let mut hasher = Sha256::new();
        let file_len = metadata.len();
        hasher.update(b"echosub-fast-fingerprint-v1");
        hasher.update(file_len.to_le_bytes());
        if let Some(file_name) = normalized.file_name().and_then(|name| name.to_str()) {
            hasher.update(file_name.as_bytes());
        }
        if let Ok(modified) = metadata.modified() {
            if let Ok(duration) = modified.duration_since(UNIX_EPOCH) {
                hasher.update(duration.as_secs().to_le_bytes());
                hasher.update(duration.subsec_nanos().to_le_bytes());
            }
        }

        let mut offsets = vec![0];
        if file_len > FINGERPRINT_SAMPLE_SIZE {
            offsets.push((file_len / 2).saturating_sub(FINGERPRINT_SAMPLE_SIZE / 2));
            offsets.push(file_len.saturating_sub(FINGERPRINT_SAMPLE_SIZE));
        }
        offsets.sort_unstable();
        offsets.dedup();

        let mut buffer = vec![0_u8; FINGERPRINT_SAMPLE_SIZE as usize];
        for offset in offsets {
            if offset >= file_len {
                continue;
            }
            file.seek(SeekFrom::Start(offset))
                .map_err(|e| format!("读取文件指纹失败: {e}"))?;
            let target_len = FINGERPRINT_SAMPLE_SIZE.min(file_len - offset) as usize;
            let read = file
                .read(&mut buffer[..target_len])
                .map_err(|e| format!("读取文件指纹失败: {e}"))?;
            hasher.update(offset.to_le_bytes());
            hasher.update((read as u64).to_le_bytes());
            hasher.update(&buffer[..read]);
        }

        Ok(hex::encode(hasher.finalize()))
    })
    .await
    .map_err(|e| format!("文件指纹任务失败: {e}"))?
}

#[tauri::command]
pub fn create_temp_media_path(
    app: AppHandle,
    state: State<'_, AppState>,
    ext: String,
) -> Result<String, String> {
    let clean_ext = ext.trim_start_matches('.').to_ascii_lowercase();
    if clean_ext.is_empty()
        || clean_ext.len() > 8
        || !clean_ext.chars().all(|c| c.is_ascii_alphanumeric())
    {
        return Err("非法临时文件扩展名".to_string());
    }

    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("无法获取缓存目录: {e}"))?
        .join("media-temp");
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建临时目录: {e}"))?;
    let dir = dir
        .canonicalize()
        .map_err(|e| format!("临时目录无效: {e}"))?;
    let file_name = format!(
        "{}_{}.{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("系统时间异常: {e}"))?
            .as_millis(),
        clean_ext
    );
    let path = dir.join(file_name);
    state.register_temp_file(path.clone());
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn reveal_in_folder(path: String) -> Result<(), String> {
    if fs::metadata(&path).is_err() {
        return Err(format!("文件不存在: {path}"));
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("无法打开 Finder: {e}"))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| format!("无法打开资源管理器: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        let parent = std::path::Path::new(&path)
            .parent()
            .and_then(|p| p.to_str())
            .unwrap_or(&path);
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("无法打开文件管理器: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn write_subtitle_file(app: AppHandle, id: String, content: String) -> Result<String, String> {
    sanitize_id(&id)?;
    let subtitles_dir = subtitles_dir(&app)?;
    let file_path = subtitles_dir.join(format!("{}.srt", id));
    fs::write(&file_path, &content).map_err(|e| format!("无法写入字幕文件: {e}"))?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_file(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let normalized = normalize_path(&path)?;
    if !state.take_temp_file(&normalized) {
        return Err("拒绝删除未登记的临时文件".to_string());
    }
    if fs::metadata(&normalized).is_ok() {
        fs::remove_file(&normalized).map_err(|e| format!("删除文件失败: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_subtitle_file(app: AppHandle, path: String) -> Result<(), String> {
    let normalized = normalize_path(&path)?;
    let dir = subtitles_dir(&app)?
        .canonicalize()
        .map_err(|e| format!("字幕目录无效: {e}"))?;
    if !normalized.starts_with(&dir) {
        return Err("拒绝删除应用字幕目录之外的文件".to_string());
    }
    if normalized.extension().and_then(|e| e.to_str()) != Some("srt") {
        return Err("只允许删除 SRT 字幕文件".to_string());
    }
    if fs::metadata(&normalized).is_ok() {
        fs::remove_file(&normalized).map_err(|e| format!("删除字幕文件失败: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn cancel_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state.cancel_task(&task_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::sanitize_id;

    #[test]
    fn accepts_safe_subtitle_ids() {
        assert!(sanitize_id("abc-123_DEF").is_ok());
    }

    #[test]
    fn rejects_empty_or_path_like_subtitle_ids() {
        assert!(sanitize_id("").is_err());
        assert!(sanitize_id("../escape").is_err());
        assert!(sanitize_id("nested/path").is_err());
        assert!(sanitize_id("with space").is_err());
    }

    #[test]
    fn rejects_overly_long_subtitle_ids() {
        let id = "a".repeat(129);
        assert!(sanitize_id(&id).is_err());
    }
}
