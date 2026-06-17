use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::time::{sleep, Duration};

use crate::srt_batch::{
    build_translation_batches, parse_srt_blocks, parse_translation_items,
    rebuild_srt_with_translations, TranslationItem,
};
use crate::types::TaskEvent;

const LLAMA_SERVER_SIDECAR: &str = "binaries/llama-server";
const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 39117;
const DEFAULT_CTX_SIZE: u32 = 4096;

#[derive(Default, Clone)]
pub struct LocalLlmState {
    inner: Arc<Mutex<Option<LocalLlmProcess>>>,
}

#[derive(Debug)]
struct LocalLlmProcess {
    child: CommandChild,
    pid: u32,
    model_path: PathBuf,
    host: String,
    port: u16,
    url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartLocalLlmRequest {
    pub model_path: String,
    pub port: Option<u16>,
    pub ctx_size: Option<u32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmServerStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub model_path: Option<String>,
    pub host: String,
    pub port: u16,
    pub url: String,
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

fn normalize_translate_model_path(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let normalized = Path::new(path)
        .canonicalize()
        .map_err(|e| format!("翻译模型路径无效: {e}"))?;
    let dir = translate_models_dir(app)?
        .canonicalize()
        .map_err(|e| format!("翻译模型目录无效: {e}"))?;
    if !normalized.starts_with(&dir) {
        return Err("拒绝使用翻译模型目录之外的文件".to_string());
    }
    if normalized.extension().and_then(|e| e.to_str()) != Some("gguf") {
        return Err("本地字幕翻译模型必须是 .gguf 文件".to_string());
    }
    Ok(normalized)
}

fn status_from_process(process: Option<&LocalLlmProcess>) -> LocalLlmServerStatus {
    match process {
        Some(process) => LocalLlmServerStatus {
            running: true,
            pid: Some(process.pid),
            model_path: Some(process.model_path.to_string_lossy().to_string()),
            host: process.host.clone(),
            port: process.port,
            url: process.url.clone(),
        },
        None => LocalLlmServerStatus {
            running: false,
            pid: None,
            model_path: None,
            host: DEFAULT_HOST.to_string(),
            port: DEFAULT_PORT,
            url: format!("http://{DEFAULT_HOST}:{DEFAULT_PORT}"),
        },
    }
}

async fn wait_until_healthy(url: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| format!("创建本地 LLM 健康检查客户端失败: {e}"))?;
    let health_url = format!("{url}/health");

    for _ in 0..30 {
        match client.get(&health_url).send().await {
            Ok(response) if response.status().is_success() => return Ok(()),
            _ => sleep(Duration::from_millis(500)).await,
        }
    }

    Err("llama-server 已启动但健康检查超时".to_string())
}

fn stop_locked(process: Option<LocalLlmProcess>) -> Result<(), String> {
    if let Some(process) = process {
        process
            .child
            .kill()
            .map_err(|e| format!("停止 llama-server 失败: {e}"))?;
    }
    Ok(())
}

fn emit_task<T>(app: &AppHandle, event: &str, task_id: &str, payload: T)
where
    T: serde::Serialize + Clone,
{
    let _ = app.emit(
        event,
        TaskEvent {
            task_id: task_id.to_string(),
            payload,
        },
    );
}

async fn ensure_local_llm_server(
    app: AppHandle,
    state: &LocalLlmState,
    req: StartLocalLlmRequest,
) -> Result<LocalLlmServerStatus, String> {
    let model_path = normalize_translate_model_path(&app, &req.model_path)?;
    let host = DEFAULT_HOST.to_string();
    let port = req.port.unwrap_or(DEFAULT_PORT);
    let ctx_size = req.ctx_size.unwrap_or(DEFAULT_CTX_SIZE);
    let url = format!("http://{host}:{port}");

    {
        let guard = state
            .inner
            .lock()
            .map_err(|_| "本地 LLM 状态锁已损坏".to_string())?;
        if let Some(process) = guard.as_ref() {
            if process.model_path == model_path && process.port == port {
                return Ok(status_from_process(Some(process)));
            }
        }
    }

    let old_process = {
        let mut guard = state
            .inner
            .lock()
            .map_err(|_| "本地 LLM 状态锁已损坏".to_string())?;
        guard.take()
    };
    stop_locked(old_process)?;

    let args = [
        "--host".to_string(),
        host.clone(),
        "--port".to_string(),
        port.to_string(),
        "--model".to_string(),
        model_path.to_string_lossy().to_string(),
        "--ctx-size".to_string(),
        ctx_size.to_string(),
    ];

    crate::debug!(
        "[local-llm] starting llama-server: {} {}",
        LLAMA_SERVER_SIDECAR,
        args.join(" ")
    );
    let (mut rx, child) = app
        .shell()
        .sidecar(LLAMA_SERVER_SIDECAR)
        .map_err(|e| format!("无法定位 llama-server sidecar: {e}"))?
        .args(args)
        .spawn()
        .map_err(|e| format!("启动 llama-server 失败: {e}"))?;
    let pid = child.pid();

    let state_for_events = state.inner.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    crate::debug!("[llama-server stdout] {}", text.trim_end());
                }
                CommandEvent::Stderr(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    crate::debug!("[llama-server stderr] {}", text.trim_end());
                }
                CommandEvent::Error(err) => {
                    crate::debug!("[llama-server error] {err}");
                }
                CommandEvent::Terminated(payload) => {
                    crate::debug!(
                        "[llama-server terminated] pid={} code={:?} signal={:?}",
                        pid,
                        payload.code,
                        payload.signal
                    );
                    if let Ok(mut guard) = state_for_events.lock() {
                        if guard.as_ref().is_some_and(|process| process.pid == pid) {
                            *guard = None;
                        }
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    {
        let mut guard = state
            .inner
            .lock()
            .map_err(|_| "本地 LLM 状态锁已损坏".to_string())?;
        *guard = Some(LocalLlmProcess {
            child,
            pid,
            model_path,
            host,
            port,
            url: url.clone(),
        });
    }

    if let Err(err) = wait_until_healthy(&url).await {
        let old_process = {
            let mut guard = state
                .inner
                .lock()
                .map_err(|_| "本地 LLM 状态锁已损坏".to_string())?;
            guard.take()
        };
        let _ = stop_locked(old_process);
        return Err(err);
    }

    let guard = state
        .inner
        .lock()
        .map_err(|_| "本地 LLM 状态锁已损坏".to_string())?;
    Ok(status_from_process(guard.as_ref()))
}

#[tauri::command]
pub async fn start_local_llm_server(
    app: AppHandle,
    state: State<'_, LocalLlmState>,
    req: StartLocalLlmRequest,
) -> Result<LocalLlmServerStatus, String> {
    ensure_local_llm_server(app, state.inner(), req).await
}

#[tauri::command]
pub fn stop_local_llm_server(state: State<'_, LocalLlmState>) -> Result<(), String> {
    let old_process = {
        let mut guard = state
            .inner
            .lock()
            .map_err(|_| "本地 LLM 状态锁已损坏".to_string())?;
        guard.take()
    };
    stop_locked(old_process)
}

#[tauri::command]
pub fn get_local_llm_server_status(
    state: State<'_, LocalLlmState>,
) -> Result<LocalLlmServerStatus, String> {
    let guard = state
        .inner
        .lock()
        .map_err(|_| "本地 LLM 状态锁已损坏".to_string())?;
    Ok(status_from_process(guard.as_ref()))
}

fn build_batch_prompt(units_json: &str, source_lang: &str, target_lang: &str) -> String {
    format!(
        "你是专业字幕翻译引擎。请把 JSON 数组中的 text 从{source_lang}翻译成{target_lang}。\n\
         严格要求：\n\
         1. 只输出 JSON 数组，不要 Markdown，不要解释。\n\
         2. 每个对象必须保留原 id，字段名必须是 id 和 translation。\n\
         3. 不要合并、拆分、删除或新增条目。\n\
         4. translation 只放译文，不要包含时间轴或编号。\n\n\
         输入 JSON：\n{units_json}"
    )
}

async fn call_llama_chat(url: &str, prompt: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| format!("创建本地 LLM HTTP 客户端失败: {e}"))?;
    let body = serde_json::json!({
        "model": "local",
        "messages": [
            { "role": "system", "content": "You translate subtitles and return strict JSON only." },
            { "role": "user", "content": prompt }
        ],
        "temperature": 0.1,
        "stream": false
    });
    let response = client
        .post(format!("{url}/v1/chat/completions"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("本地 LLM 请求失败: {e}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("本地 LLM 请求失败 ({status}): {text}"));
    }
    let value = response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("解析本地 LLM 响应失败: {e}"))?;
    value["choices"][0]["message"]["content"]
        .as_str()
        .map(ToString::to_string)
        .ok_or_else(|| format!("本地 LLM 响应缺少 choices[0].message.content: {value}"))
}

pub async fn translate_srt_with_local_llm(
    app: AppHandle,
    state: &LocalLlmState,
    task_id: String,
    srt_text: String,
    source_lang: String,
    target_lang: String,
    model_path: String,
) -> Result<String, String> {
    emit_task(
        &app,
        "translate-progress",
        &task_id,
        "启动本地字幕翻译模型...".to_string(),
    );
    let status = ensure_local_llm_server(
        app.clone(),
        state,
        StartLocalLlmRequest {
            model_path,
            port: None,
            ctx_size: None,
        },
    )
    .await?;

    let blocks = parse_srt_blocks(&srt_text)?;
    let batches = build_translation_batches(&blocks, 30, 4_000);
    let total = batches.len();
    let mut translated_items = Vec::<TranslationItem>::new();

    for (i, batch) in batches.iter().enumerate() {
        emit_task(
            &app,
            "translate-progress",
            &task_id,
            format!("本地字幕翻译中 {}/{}", i + 1, total),
        );
        let units_json = serde_json::to_string(&batch.units)
            .map_err(|e| format!("构建本地翻译批次失败: {e}"))?;
        let prompt = build_batch_prompt(&units_json, &source_lang, &target_lang);
        let raw = call_llama_chat(&status.url, &prompt).await?;
        let mut items = parse_translation_items(&raw)?;
        translated_items.append(&mut items);
    }

    let merge = rebuild_srt_with_translations(&blocks, &translated_items);
    for warning in &merge.warnings {
        crate::debug!("[local-llm translate warning] {warning}");
    }
    Ok(merge.srt)
}

#[cfg(test)]
mod tests {
    use super::build_batch_prompt;

    #[test]
    fn prompt_requires_json_only() {
        let prompt = build_batch_prompt(r#"[{"id":1,"text":"hello"}]"#, "英语", "中文");

        assert!(prompt.contains("只输出 JSON 数组"));
        assert!(prompt.contains("id 和 translation"));
        assert!(prompt.contains("hello"));
    }
}
