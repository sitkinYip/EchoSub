//! 本地 HLS media server。
//!
//! 负责管理播放器专用 FFmpeg 会话（生成分片 HLS）并通过一个绑在 127.0.0.1 随机端口
//! 的 axum 服务对外提供这些文件。生命周期骨架复用 `local_llm.rs`：进程引用由
//! `MediaServerState` 持有，事件循环监听 `Terminated` 自动清理。
//!
//! 与前端 `ffmpegService.ts` 的 `"player"` 分组职责分离：那里的 player 组只服务
//! 一次性兼容副本（`runMakePlayableCopy`），本模块独立管理长生命周期的 HLS 进程，
//! 两者互不干扰。

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex, OnceLock};

use axum::extract::{Path as AxumPath, State as AxumState};
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tower_http::services::ServeFile;

const FFMPEG_SIDECAR: &str = "binaries/ffmpeg";
const DEFAULT_HOST: &str = "127.0.0.1";

/// 校验 session_id / dir_name 格式：仅允许 `[A-Za-z0-9_-]`，长度 1..=128。
/// 与 `file_ops::sanitize_id` 同一策略，避免路径注入。
fn sanitize_token(token: &str) -> Result<(), String> {
    if token.is_empty()
        || token.len() > 128
        || !token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("非法 token: {token}"));
    }
    Ok(())
}

/// 播放器 session 目录根：<app_cache>/media-temp/player/
fn player_sessions_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("无法获取缓存目录: {e}"))?
        .join("media-temp")
        .join("player");
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建播放器 session 目录: {e}"))?;
    Ok(dir)
}

#[derive(Debug)]
struct PlayerSession {
    dir: PathBuf,
    /// 真实会话持有 ffmpeg 子进程；测试注入的会话为 None（只登记目录）。
    child: Option<CommandChild>,
    pid: u32,
}

#[derive(Default, Clone)]
pub struct MediaServerState {
    inner: Arc<Mutex<HashMap<String, PlayerSession>>>,
    port: Arc<OnceLock<u16>>,
}

impl MediaServerState {
    fn register(&self, session_id: String, session: PlayerSession) -> Result<(), String> {
        let mut guard = self.inner.lock().map_err(|_| "media server 状态锁已损坏")?;
        if guard.contains_key(&session_id) {
            return Err(format!("session 已存在: {session_id}"));
        }
        guard.insert(session_id, session);
        Ok(())
    }

    fn take(&self, session_id: &str) -> Option<PlayerSession> {
        self.inner
            .lock()
            .ok()
            .and_then(|mut guard| guard.remove(session_id))
    }

    /// 查询 session 目录（用于 axum 路径白名单校验）。
    fn session_dir(&self, session_id: &str) -> Option<PathBuf> {
        self.inner
            .lock()
            .ok()
            .and_then(|guard| guard.get(session_id).map(|s| s.dir.clone()))
    }

    fn port(&self) -> Option<u16> {
        self.port.get().copied()
    }

    /// 应用退出时清理：停掉所有 session 进程并删除目录。
    pub fn shutdown_all(&self) {
        let sessions: Vec<PlayerSession> = {
            let mut guard = match self.inner.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            guard.drain().map(|(_, v)| v).collect()
        };
        for session in sessions {
            if let Some(child) = session.child {
                let _ = child.kill();
            }
            let _ = fs::remove_dir_all(&session.dir);
        }
    }

    /// 测试专用：只登记一个 session 目录，不持有子进程。
    /// 调用方负责创建 dir 并 canonicalize。
    #[cfg(test)]
    pub(crate) fn register_dir_for_test(&self, session_id: &str, dir: PathBuf) {
        let mut guard = self.inner.lock().unwrap();
        guard.insert(
            session_id.to_string(),
            PlayerSession {
                dir,
                child: None,
                pid: 0,
            },
        );
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSessionInfo {
    pub origin: String,
    pub base_url: String,
    pub playlist_url: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaServerOrigin {
    pub ready: bool,
    pub origin: String,
}

fn build_args(
    input_path: &str,
    dir: &Path,
    strategy: &str,
    start_time: Option<f64>,
) -> Result<Vec<String>, String> {
    let dir_str = dir.to_string_lossy();
    let segment_filename = format!("{dir_str}/seg-%05d.m4s");
    let playlist = format!("{dir_str}/index.m3u8");

    let mut args = vec!["-hide_banner".to_string()];

    // 输入级 -ss（demuxer seek，快速跳转）。放在 -i 前。
    // 不加 -copyts：让 ffmpeg 把分片 PTS rebase 到 0，
    // 由前端 hls.js 的 timelineOffset 负责把时间轴平移回 start_time。
    if let Some(t) = start_time {
        if t > 0.0 && t.is_finite() {
            args.push("-ss".to_string());
            args.push(format!("{t}"));
        }
    }

    args.push("-i".to_string());
    args.push(input_path.to_string());

    match strategy {
        "remux" => {
            // 容器重封，不重编码。阶段 4 才接入判定，这里预留。
            args.extend(["-c".to_string(), "copy".to_string()]);
        }
        "transcode" => {
            args.extend([
                "-c:v".to_string(),
                "libx264".to_string(),
                "-preset".to_string(),
                "veryfast".to_string(),
                "-crf".to_string(),
                "23".to_string(),
                "-pix_fmt".to_string(),
                "yuv420p".to_string(),
                "-c:a".to_string(),
                "aac".to_string(),
                "-b:a".to_string(),
                "160k".to_string(),
                "-threads".to_string(),
                "2".to_string(),
            ]);
        }
        other => return Err(format!("未知 strategy: {other}（仅支持 remux/transcode）")),
    }

    args.extend([
        "-f".to_string(),
        "hls".to_string(),
        "-hls_time".to_string(),
        "4".to_string(),
        "-hls_list_size".to_string(),
        "0".to_string(),
        "-hls_segment_type".to_string(),
        "fmp4".to_string(),
        "-hls_fmp4_init_filename".to_string(),
        "init.mp4".to_string(),
        "-hls_segment_filename".to_string(),
        segment_filename,
        "-hls_flags".to_string(),
        "temp_file+omit_endlist".to_string(),
        "-y".to_string(),
        playlist,
    ]);
    Ok(args)
}

#[tauri::command]
pub async fn start_player_session(
    app: AppHandle,
    state: tauri::State<'_, MediaServerState>,
    session_id: String,
    input_path: String,
    dir_name: String,
    strategy: String,
    start_time: Option<f64>,
) -> Result<PlayerSessionInfo, String> {
    sanitize_token(&session_id)?;
    sanitize_token(&dir_name)?;
    if !matches!(strategy.as_str(), "remux" | "transcode") {
        return Err(format!("未知 strategy: {strategy}"));
    }

    let origin = state
        .port()
        .map(|p| format!("http://{DEFAULT_HOST}:{p}"))
        .ok_or_else(|| "media server 尚未就绪".to_string())?;

    let normalized_input = Path::new(&input_path)
        .canonicalize()
        .map_err(|e| format!("输入路径无效: {e}"))?;
    if !normalized_input.is_file() {
        return Err("输入路径不是文件".to_string());
    }

    let root = player_sessions_root(&app)?;
    let dir = root.join(&dir_name);
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建 session 目录: {e}"))?;
    let dir = dir
        .canonicalize()
        .map_err(|e| format!("session 目录无效: {e}"))?;

    let args = build_args(
        normalized_input.to_string_lossy().as_ref(),
        &dir,
        &strategy,
        start_time,
    )?;
    crate::debug!(
        "[media-server] starting ffmpeg: {} {}",
        FFMPEG_SIDECAR,
        args.join(" ")
    );

    let (mut rx, child) = app
        .shell()
        .sidecar(FFMPEG_SIDECAR)
        .map_err(|e| format!("无法定位 ffmpeg sidecar: {e}"))?
        .args(args)
        .spawn()
        .map_err(|e| format!("启动 ffmpeg 失败: {e}"))?;
    let pid = child.pid();

    let inner = state.inner.clone();
    let dir_for_cleanup = dir.clone();
    let session_id_for_cleanup = session_id.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stderr(bytes) => {
                    crate::debug!(
                        "[media-server ffmpeg stderr] {}",
                        String::from_utf8_lossy(&bytes).trim_end()
                    );
                }
                CommandEvent::Terminated(payload) => {
                    crate::debug!(
                        "[media-server ffmpeg terminated] pid={} code={:?} signal={:?}",
                        pid,
                        payload.code,
                        payload.signal
                    );
                    // 进程退出后清理目录与 map 记录
                    if let Ok(mut guard) = inner.lock() {
                        if guard
                            .get(&session_id_for_cleanup)
                            .is_some_and(|s| s.pid == pid)
                        {
                            guard.remove(&session_id_for_cleanup);
                        }
                    }
                    let _ = fs::remove_dir_all(&dir_for_cleanup);
                    break;
                }
                _ => {}
            }
        }
    });

    state.register(
        session_id.clone(),
        PlayerSession {
            dir: dir.clone(),
            child: Some(child),
            pid,
        },
    )?;

    let base_url = format!("/player/{session_id}/");
    let playlist_url = format!("{origin}/player/{session_id}/index.m3u8");
    Ok(PlayerSessionInfo {
        origin,
        base_url,
        playlist_url,
    })
}

#[tauri::command]
pub fn stop_player_session(
    state: tauri::State<'_, MediaServerState>,
    session_id: String,
) -> Result<(), String> {
    sanitize_token(&session_id)?;
    let Some(session) = state.take(&session_id) else {
        return Ok(()); // 幂等
    };
    if let Some(child) = session.child {
        child
            .kill()
            .map_err(|e| format!("停止 ffmpeg 失败: {e}"))?;
    }
    let _ = fs::remove_dir_all(&session.dir);
    Ok(())
}

#[tauri::command]
pub fn get_media_server_origin(
    state: tauri::State<'_, MediaServerState>,
) -> Result<MediaServerOrigin, String> {
    match state.port() {
        Some(p) => Ok(MediaServerOrigin {
            ready: true,
            origin: format!("http://{DEFAULT_HOST}:{p}"),
        }),
        None => Ok(MediaServerOrigin {
            ready: false,
            origin: format!("http://{DEFAULT_HOST}:0"),
        }),
    }
}

// ── axum server ──

/// 按扩展名映射 MIME，无需第三方 crate。
fn mime_for_ext(ext: &str) -> &'static str {
    match ext {
        "m3u8" => "application/vnd.apple.mpegurl",
        "m4s" => "video/iso.segment",
        "mp4" | "cmfv" | "cmfa" => "video/mp4",
        "ts" => "video/mp2t",
        "key" => "application/octet-stream",
        _ => "application/octet-stream",
    }
}

/// 解析请求文件名，返回 (canonicalized_path, ext) 或 None（路径穿越/不存在）。
/// `session_dir` 必须是已 canonicalize 的目录。
fn resolve_session_file(session_dir: &Path, file: &str) -> Option<(PathBuf, String)> {
    // 拒绝绝对路径与显式穿越片段
    if file.is_empty()
        || file.starts_with('/')
        || file.contains("..")
        || file.starts_with('\\')
    {
        return None;
    }
    let candidate = session_dir.join(file);
    let canonical = fs::canonicalize(&candidate).ok()?;
    if !canonical.starts_with(session_dir) {
        return None;
    }
    let ext = canonical
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    Some((canonical, ext))
}

async fn serve_hls_file(
    AxumPath((session_id, file)): AxumPath<(String, String)>,
    AxumState(media_state): AxumState<Arc<MediaServerState>>,
    request: axum::extract::Request,
) -> Response {
    let Some(session_dir) = media_state.session_dir(&session_id) else {
        return (StatusCode::NOT_FOUND, "session 不存在或已结束").into_response();
    };

    let Some((path, ext)) = resolve_session_file(&session_dir, &file) else {
        return (StatusCode::NOT_FOUND, "文件不存在或被拒绝").into_response();
    };

    let mut serve = ServeFile::new(path);
    let response = match serve.try_call(request).await {
        Ok(r) => r,
        Err(_) => return (StatusCode::NOT_FOUND, "无法读取分片").into_response(),
    };
    let mut response = response.into_response();

    // 强制覆盖 MIME：ServeFile 用 mime_guess 可能给 .m3u8 返回 text/plain。
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(mime_for_ext(&ext)),
    );
    // .m3u8 必须禁缓存（playlist 在 FFmpeg 运行期间持续增长）。
    if ext == "m3u8" {
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, CACHE_HEADER_NOCACHE.clone());
    }
    response
}

static CACHE_HEADER_NOCACHE: LazyLock<HeaderValue> =
    LazyLock::new(|| HeaderValue::from_static("no-cache, no-store"));

/// 构建播放器 HLS 路由。`media_state` 由调用方提供 Arc。
pub fn player_router(media_state: Arc<MediaServerState>) -> Router {
    Router::new()
        .route("/player/{session_id}/{*file}", get(serve_hls_file))
        .with_state(media_state)
}

/// 启动 axum server，返回绑定的端口。阻塞调用者，需在 `tauri::async_runtime::spawn` 内执行。
pub async fn serve(media_state: Arc<MediaServerState>) -> std::io::Result<()> {
    let listener = tokio::net::TcpListener::bind((DEFAULT_HOST, 0)).await?;
    let port = listener.local_addr()?.port();
    let _ = media_state.port.set(port);
    crate::debug!("[media-server] listening on http://{DEFAULT_HOST}:{port}");
    let app = player_router(media_state);
    axum::serve(listener, app).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mime_maps_known_hls_types() {
        assert_eq!(mime_for_ext("m3u8"), "application/vnd.apple.mpegurl");
        assert_eq!(mime_for_ext("m4s"), "video/iso.segment");
        assert_eq!(mime_for_ext("mp4"), "video/mp4");
        assert_eq!(mime_for_ext("unknown"), "application/octet-stream");
    }

    #[test]
    fn sanitize_token_rejects_traversal_and_empty() {
        assert!(sanitize_token("").is_err());
        assert!(sanitize_token("../escape").is_err());
        assert!(sanitize_token("a/b").is_err());
        assert!(sanitize_token("a b").is_err());
        assert!(sanitize_token("abc-123_DEF").is_ok());
    }

    #[test]
    fn build_args_transcode_includes_hls_flags() {
        let dir = Path::new("/tmp/fake-session");
        let args = build_args("/input.mkv", dir, "transcode", None).unwrap();
        assert!(args.contains(&"-f".to_string()));
        assert!(args.contains(&"hls".to_string()));
        assert!(args.contains(&"temp_file+omit_endlist".to_string()));
        assert!(args.contains(&"libx264".to_string()));
        assert!(args.iter().any(|a| a.ends_with("index.m3u8")));
    }

    #[test]
    fn build_args_rejects_unknown_strategy() {
        let dir = Path::new("/tmp/fake-session");
        assert!(build_args("/input.mkv", dir, "nuke", None).is_err());
    }

    #[test]
    fn build_args_remux_uses_copy() {
        let dir = Path::new("/tmp/fake-session");
        let args = build_args("/input.mkv", dir, "remux", None).unwrap();
        let copy_idx = args.iter().position(|a| a == "copy");
        let codec_idx = args.iter().position(|a| a == "-c");
        assert!(copy_idx.is_some() && codec_idx.is_some());
    }

    #[test]
    fn build_args_inserts_ss_before_input_when_start_time_positive() {
        let dir = Path::new("/tmp/fake-session");
        let args = build_args("/input.mkv", dir, "transcode", Some(85.5)).unwrap();
        let ss_idx = args.iter().position(|a| a == "-ss");
        let i_idx = args.iter().position(|a| a == "-i");
        assert!(ss_idx.is_some(), "应有 -ss 参数");
        assert!(i_idx.is_some());
        assert!(
            ss_idx.unwrap() < i_idx.unwrap(),
            "-ss 必须在 -i 之前（输入级 seek）"
        );
        // -ss 的值应紧跟其后
        assert_eq!(args.get(ss_idx.unwrap() + 1), Some(&"85.5".to_string()));
    }

    #[test]
    fn build_args_omits_ss_when_start_time_zero_or_none() {
        let dir = Path::new("/tmp/fake-session");
        let args_none = build_args("/input.mkv", dir, "transcode", None).unwrap();
        assert!(!args_none.contains(&"-ss".to_string()), "None 不应有 -ss");

        let args_zero = build_args("/input.mkv", dir, "transcode", Some(0.0)).unwrap();
        assert!(!args_zero.contains(&"-ss".to_string()), "0.0 不应有 -ss");
    }

    #[test]
    fn build_args_never_includes_copyts() {
        // timelineOffset 方案要求分片 PTS 从 0 开始，必须移除 -copyts
        let dir = Path::new("/tmp/fake-session");
        let args = build_args("/input.mkv", dir, "transcode", Some(60.0)).unwrap();
        assert!(
            !args.contains(&"-copyts".to_string()),
            "不应包含 -copyts（会破坏 hls.js timelineOffset）"
        );
    }

    #[test]
    fn resolve_session_file_rejects_traversal() {
        let dir = Path::new("/tmp/whatever");
        assert!(resolve_session_file(dir, "../escape").is_none());
        assert!(resolve_session_file(dir, "/etc/passwd").is_none());
        assert!(resolve_session_file(dir, "a/../b").is_none());
    }

    #[test]
    fn empty_state_has_no_sessions_or_port() {
        let state = MediaServerState::default();
        assert!(state.session_dir("none").is_none());
        assert!(state.port().is_none());
        assert!(state.take("none").is_none());
    }

    // ── axum 路由集成测试 ──
    // 不依赖真实 ffmpeg，只验证路由本身：MIME、路径穿越拦截、session 存在性、缓存头。

    use axum::body::{to_bytes, Body};
    use axum::http::{Request, StatusCode};
    use tower::util::ServiceExt;

    /// 在临时目录里造一个测试 session，返回 (state, session_id, dir)。
    fn make_test_session(id: &str) -> (Arc<MediaServerState>, String, PathBuf) {
        let dir = std::env::temp_dir().join(format!("stran-hls-test-{}-{}", id, std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let dir = dir.canonicalize().unwrap();
        let state = MediaServerState::default();
        state.register_dir_for_test(id, dir.clone());
        (Arc::new(state), id.to_string(), dir)
    }

    #[tokio::test]
    async fn serves_m3u8_with_correct_mime_and_no_cache() {
        let (state, sid, dir) = make_test_session("sess-a");
        fs::write(dir.join("index.m3u8"), b"#EXTM3U\n").unwrap();

        let app = player_router(state);
        let resp = app
            .oneshot(
                Request::builder()
                    .uri(format!("/player/{sid}/index.m3u8"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(
            resp.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/vnd.apple.mpegurl"
        );
        assert_eq!(
            resp.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-cache, no-store"
        );
    }

    #[tokio::test]
    async fn serves_m4s_with_segment_mime() {
        let (state, sid, dir) = make_test_session("sess-b");
        fs::write(dir.join("seg-00001.m4s"), b"\x00\x00\x00\x18ftyp").unwrap();

        let app = player_router(state);
        let resp = app
            .oneshot(
                Request::builder()
                    .uri(format!("/player/{sid}/seg-00001.m4s"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(
            resp.headers().get(header::CONTENT_TYPE).unwrap(),
            "video/iso.segment"
        );
        // 分片不应带 no-cache 头
        assert!(resp.headers().get(header::CACHE_CONTROL).is_none());
        let bytes = to_bytes(resp.into_body(), 1024).await.unwrap();
        assert!(!bytes.is_empty());
    }

    #[tokio::test]
    async fn rejects_path_traversal_attempt() {
        let (state, sid, _dir) = make_test_session("sess-c");

        let app = player_router(state);
        let resp = app
            .oneshot(
                Request::builder()
                    .uri(format!("/player/{sid}/..%2Fescape"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // 路径含 .. —— resolve_session_file 直接拒绝（404），不会触及文件系统
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn unknown_session_returns_404() {
        let state = Arc::new(MediaServerState::default());
        let app = player_router(state);
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/player/no-such-session/index.m3u8")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn missing_file_in_known_session_returns_404() {
        let (state, sid, _dir) = make_test_session("sess-d");

        let app = player_router(state);
        let resp = app
            .oneshot(
                Request::builder()
                    .uri(format!("/player/{sid}/does-not-exist.m3u8"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }
}
