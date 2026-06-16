use crate::types::FileInfo;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

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
pub fn reveal_in_folder(path: String) -> Result<(), String> {
    if !fs::metadata(&path).is_ok() {
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
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取数据目录: {e}"))?;
    let subtitles_dir = dir.join("subtitles");
    fs::create_dir_all(&subtitles_dir).map_err(|e| format!("无法创建字幕目录: {e}"))?;
    let file_path = subtitles_dir.join(format!("{}.srt", id));
    fs::write(&file_path, &content).map_err(|e| format!("无法写入字幕文件: {e}"))?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    if fs::metadata(&path).is_ok() {
        fs::remove_file(&path).map_err(|e| format!("删除文件失败: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_subtitle_file(path: String) -> Result<(), String> {
    delete_file(path)
}
