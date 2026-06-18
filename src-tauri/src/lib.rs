// ── Modules ──
mod file_ops;
mod local_llm;
mod media_server;
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
    let media_state = media_server::MediaServerState::default();
    let media_state_for_server = std::sync::Arc::new(media_state.clone());
    let media_state_for_shutdown = media_state.clone();

    let app = tauri::Builder::default()
        .manage(state::AppState::default())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .manage(local_llm::LocalLlmState::default())
        .manage(media_state)
        .setup(move |app| {
            file_ops::cleanup_media_temp_dir(app.handle());

            // 启动本地 HLS media server（绑 127.0.0.1 随机端口）。
            // 仅播放器使用；失败不阻塞应用启动，播放器会探测到未就绪并回退。
            let state_for_serve = media_state_for_server.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = media_server::serve(state_for_serve).await {
                    eprintln!("[media-server] serve exited: {e}");
                }
            });

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
            translate::local_pipeline_translate,
            media_server::start_player_session,
            media_server::stop_player_session,
            media_server::get_media_server_origin
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(move |_app_handle, event| {
        // 应用退出时停掉所有播放器 HLS 进程并清理 session 目录。
        if let tauri::RunEvent::Exit = event {
            media_state_for_shutdown.shutdown_all();
        }
    });
}
