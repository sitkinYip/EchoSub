//! 本地 Whisper 离线 ASR 引擎。
//!
//! 基于 whisper-rs（whisper.cpp 绑定），在客户端进程内做语音识别，
//! 用于规避云端对私人化内容的审核。Whisper 只做识别（转录），不做翻译；
//! 跨语言翻译由 `providers::text_translate` 在 ASR 之后接管。
//!
//! 设计要点：
//! - whisper-rs 是同步阻塞的 CPU/Metal 推理，必须放在 `tokio::task::spawn_blocking`，
//!   否则会冻结 Tauri 的 async 运行时。
//! - 复用全局 `taskId` + 4 个 `translate-*` 事件，前端管线无需感知引擎差异。
//! - 输入要求 16kHz 单声道 f32 PCM WAV（由 `extractWav16kMono` 保证）。
//! - 推理本身不可中断；进度回调用于上报百分比，取消检查放在每段 segment 遍历时。

// 阶段 A：本模块的 ASR 入口尚未在 translate.rs 接线（阶段 C 完成），
// 期间暂允许 dead_code，避免阻塞 clippy -D warnings。接线后删除此属性。
#![allow(dead_code)]

use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::state::AppState;
use crate::types::TaskEvent;

#[derive(Clone, Copy)]
pub struct WhisperEventOptions {
    pub emit_chunk: bool,
    pub emit_done: bool,
}

/// 把 EchoSub 内部的源语言名（中文/日语/英语/韩语）映射成 whisper 语言代码。
/// Whisper 语言代码表见 whisper.cpp，这里只覆盖当前支持的语言。
pub fn whisper_lang_code(lang: &str) -> Option<&'static str> {
    match lang {
        "中文" => Some("zh"),
        "日语" => Some("ja"),
        "英语" => Some("en"),
        "韩语" => Some("ko"),
        _ => None,
    }
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

/// 把 `centiseconds`（whisper 时间戳单位，1cs = 10ms）格式化成 SRT 时间码
/// `HH:MM:SS,mmm`。
fn cs_to_srt_time(cs: i64) -> String {
    let total_ms = cs * 10;
    let ms = total_ms % 1000;
    let total_s = total_ms / 1000;
    let s = total_s % 60;
    let total_m = total_s / 60;
    let m = total_m % 60;
    let h = total_m / 60;
    format!("{h:02}:{m:02}:{s:02},{ms:03}")
}

/// 读取 16kHz 单声道 PCM WAV，转成 whisper 需要的 f32 样本数组。
/// hound 会自动按 WAV header 解析位深（8/16/24/32-bit, float/int）。
fn load_wav_mono_f32(path: &PathBuf) -> Result<Vec<f32>, String> {
    let mut reader = hound::WavReader::open(path).map_err(|e| format!("无法打开 WAV 文件: {e}"))?;
    let spec = reader.spec();
    crate::debug!(
        "[whisper] wav: {}Hz {}ch {:?} {}-bit",
        spec.sample_rate,
        spec.channels,
        spec.sample_format,
        spec.bits_per_sample
    );

    if spec.channels != 1 {
        return Err(format!(
            "Whisper 需要 16kHz 单声道 WAV，实际收到 {} 声道。请通过 extractWav16kMono 重新提取。",
            spec.channels
        ));
    }
    if spec.sample_rate != 16_000 {
        return Err(format!(
            "Whisper 需要 16kHz WAV，实际收到 {}Hz。请通过 extractWav16kMono 重新提取。",
            spec.sample_rate
        ));
    }

    match spec.sample_format {
        hound::SampleFormat::Float => reader
            .into_samples::<f32>()
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取 float 样本失败: {e}")),
        hound::SampleFormat::Int => {
            let max: f32 = (1_i32 << (spec.bits_per_sample - 1)) as f32;
            reader
                .samples::<i32>()
                .map(|s| s.map(|v| v as f32 / max))
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("读取 int 样本失败: {e}"))
        }
    }
}

/// 运行本地 Whisper ASR，产出标准 SRT 文本并通过事件回流。
///
/// 调用方必须把它包在 `tokio::task::spawn_blocking` 里（见 `translate.rs`）。
/// 成功时返回识别出的 SRT 文本；失败返回错误字符串并已发 `translate-error`。
pub fn run_whisper_blocking(
    app: AppHandle,
    state: Arc<AppState>,
    task_id: String,
    wav_path: PathBuf,
    model_path: PathBuf,
    source_lang: String,
) -> Result<String, String> {
    run_whisper_blocking_with_events(
        app,
        state,
        task_id,
        wav_path,
        model_path,
        source_lang,
        WhisperEventOptions {
            emit_chunk: true,
            emit_done: true,
        },
    )
}

pub fn run_whisper_blocking_with_events(
    app: AppHandle,
    state: Arc<AppState>,
    task_id: String,
    wav_path: PathBuf,
    model_path: PathBuf,
    source_lang: String,
    events: WhisperEventOptions,
) -> Result<String, String> {
    // 1. 读 WAV
    emit_task(
        &app,
        "translate-progress",
        &task_id,
        "加载音频中...".to_string(),
    );
    let samples = load_wav_mono_f32(&wav_path)?;
    if samples.is_empty() {
        return Err("音频为空，无法识别".to_string());
    }

    if state.is_cancelled(&task_id) {
        emit_task(&app, "translate-error", &task_id, "任务已取消".to_string());
        return Err("任务已取消".to_string());
    }

    // 2. 加载模型（首次较慢）
    emit_task(
        &app,
        "translate-progress",
        &task_id,
        "加载本地模型中（首次较慢）...".to_string(),
    );
    // use_gpu 默认在启用 metal/cuda feature 时为 true（见 WhisperContextParameters::Default），无需手动设。
    let ctx_params = WhisperContextParameters::default();
    let ctx = WhisperContext::new_with_params(&model_path, ctx_params)
        .map_err(|e| format!("加载 Whisper 模型失败: {e}"))?;

    if state.is_cancelled(&task_id) {
        emit_task(&app, "translate-error", &task_id, "任务已取消".to_string());
        return Err("任务已取消".to_string());
    }

    let mut state_ctx = ctx
        .create_state()
        .map_err(|e| format!("创建推理状态失败: {e}"))?;

    // 3. 配置推理参数
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    // Whisper 永远做转录，不做翻译（翻译交给后续 text_translate）。
    params.set_translate(false);
    params.set_n_threads(num_threads());
    // 关掉 whisper.cpp 自带的 stderr 实时输出，避免污染日志。
    params.set_print_progress(false);
    params.set_print_special(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    // 锁定源语言，避免语种自动探测把日语识别成中文字符。
    if let Some(code) = whisper_lang_code(&source_lang) {
        params.set_language(Some(code));
    } else {
        // 未知语言时让 whisper 自动探测。
        params.set_language(None);
    }

    // 进度回调：0..=100。闭包需 'static，把 AppHandle/task_id 通过 Arc 传入。
    let prog_app = Arc::new(app.clone());
    let prog_task = task_id.clone();
    params.set_progress_callback_safe(move |progress: i32| {
        let p = prog_app.clone();
        let t = prog_task.clone();
        // 回调来自推理线程，emit 是线程安全的。
        emit_task(&p, "translate-progress", &t, format!("识别中 {progress}%"));
    });

    // 4. 运行推理（阻塞、CPU/Metal 密集型）
    emit_task(
        &app,
        "translate-progress",
        &task_id,
        "本地语音识别中...".to_string(),
    );
    state_ctx
        .full(params, &samples)
        .map_err(|e| format!("Whisper 推理失败: {e}"))?;

    // 推理完成后再查一次取消（推理过程本身无法中断）。
    if state.is_cancelled(&task_id) {
        emit_task(&app, "translate-error", &task_id, "任务已取消".to_string());
        return Err("任务已取消".to_string());
    }

    // 5. 收集 segments，拼成标准 SRT。
    let n = state_ctx.full_n_segments();
    let mut srt = String::new();
    let mut idx = 0;
    for i in 0..n {
        if state.is_cancelled(&task_id) {
            emit_task(&app, "translate-error", &task_id, "任务已取消".to_string());
            return Err("任务已取消".to_string());
        }
        let Some(seg) = state_ctx.get_segment(i) else {
            continue;
        };
        let start = seg.start_timestamp();
        let end = seg.end_timestamp();
        let text = seg
            .to_str_lossy()
            .map_err(|e| format!("读取片段文本失败: {e}"))?;
        let text = text.trim();
        if text.is_empty() {
            continue;
        }
        idx += 1;
        srt.push_str(&format!(
            "{idx}\n{} --> {}\n{text}\n\n",
            cs_to_srt_time(start),
            cs_to_srt_time(end)
        ));
    }

    if srt.trim().is_empty() {
        return Err("本地识别未得到任何语音内容（可能是纯音乐/无声片段）".to_string());
    }

    // 6. 回流整段 SRT，再用 done 收尾。前端复用 srtParser 解析。
    if events.emit_chunk {
        emit_task(&app, "translate-chunk", &task_id, srt.clone());
    }
    if events.emit_done {
        emit_task(&app, "translate-done", &task_id, ());
    }
    Ok(srt)
}

/// 选择推理线程数：取物理核心数，至少 1，最多 8（更多收益递减且占 CPU）。
fn num_threads() -> i32 {
    let n = std::thread::available_parallelism()
        .map(|v| v.get())
        .unwrap_or(4) as i32;
    n.clamp(1, 8)
}

#[cfg(test)]
mod tests {
    use super::{cs_to_srt_time, whisper_lang_code};

    #[test]
    fn maps_known_languages_to_whisper_codes() {
        assert_eq!(whisper_lang_code("中文"), Some("zh"));
        assert_eq!(whisper_lang_code("日语"), Some("ja"));
        assert_eq!(whisper_lang_code("英语"), Some("en"));
        assert_eq!(whisper_lang_code("韩语"), Some("ko"));
    }

    #[test]
    fn unknown_language_returns_none_for_autodetect() {
        assert_eq!(whisper_lang_code("法语"), None);
        assert_eq!(whisper_lang_code(""), None);
    }

    #[test]
    fn formats_centiseconds_as_srt_timecode() {
        // 0 cs → 00:00:00,000
        assert_eq!(cs_to_srt_time(0), "00:00:00,000");
        // 1 cs = 10 ms
        assert_eq!(cs_to_srt_time(1), "00:00:00,010");
        // 1 秒 = 100 cs
        assert_eq!(cs_to_srt_time(100), "00:00:01,000");
        // 1 分 1 秒 250 ms = 6125 cs
        assert_eq!(cs_to_srt_time(6125), "00:01:01,250");
        // 1 小时 = 360000 cs
        assert_eq!(cs_to_srt_time(360000), "01:00:00,000");
    }
}
