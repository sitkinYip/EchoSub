// ── Modules ──
mod file_ops;
mod oss;
mod prompt;
mod providers;
mod state;
mod translate;
mod types;

// ── Debug macro (strips to nothing in release) ──
macro_rules! debug {
    ($($arg:tt)*) => {
        #[cfg(debug_assertions)]
        eprintln!($($arg)*);
    };
}
pub(crate) use debug;

// ── App entry ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(state::AppState::default())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            file_ops::get_file_info,
            file_ops::reveal_in_folder,
            file_ops::write_subtitle_file,
            file_ops::delete_subtitle_file,
            file_ops::delete_file,
            file_ops::create_temp_media_path,
            file_ops::save_api_key,
            file_ops::load_api_key,
            file_ops::cancel_task,
            oss::upload_to_dashscope_oss,
            translate::stream_translate
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
