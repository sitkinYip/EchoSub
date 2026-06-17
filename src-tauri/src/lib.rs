// ── Modules ──
mod file_ops;
mod local_llm;
mod model_manager;
mod oss;
mod prompt;
mod providers;
mod srt_batch;
mod state;
mod translate;
mod types;
mod whisper;

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
        .manage(local_llm::LocalLlmState::default())
        .setup(|app| {
            file_ops::cleanup_media_temp_dir(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            file_ops::get_file_info,
            file_ops::calculate_file_hash,
            file_ops::reveal_in_folder,
            file_ops::write_subtitle_file,
            file_ops::delete_subtitle_file,
            file_ops::delete_file,
            file_ops::create_temp_media_path,
            file_ops::save_api_key,
            file_ops::load_api_key,
            file_ops::cancel_task,
            model_manager::list_whisper_models,
            model_manager::list_translate_models,
            model_manager::get_local_whisper_models,
            model_manager::get_local_translate_models,
            model_manager::download_whisper_model,
            model_manager::download_translate_model,
            model_manager::delete_whisper_model,
            model_manager::delete_translate_model,
            model_manager::check_whisper_model_exists,
            model_manager::check_translate_model_exists,
            local_llm::start_local_llm_server,
            local_llm::stop_local_llm_server,
            local_llm::get_local_llm_server_status,
            oss::upload_to_dashscope_oss,
            translate::stream_translate,
            translate::local_pipeline_translate
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
