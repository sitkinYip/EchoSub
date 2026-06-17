import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Language } from "@/types";
import { MAX_DIRECT_UPLOAD_BYTES, SUPPORTED_AUDIO_EXTS } from "@/config";
import { parseModelOutputWithWarnings } from "@/utils/srtParser";
import { showModal } from "@/components/Modal/create";
import { showMessage } from "@/components/Toast/create";
import { runFfmpeg, runExtractAudio, runExtractWav16kMono } from "./ffmpegService";
import {
  probe,
  formatDuration,
  formatMediaSummary,
  picks,
  MAX_DURATION_SECONDS,
} from "./mediaService";
import {
  createTempPath,
  isAlive,
  killSession,
  newSession,
  requireSession,
  safeSet,
  trackTemp,
  type PipelineSession,
} from "./pipelineSession";
import { useTranslationStore } from "@/stores/translationStore";
import type { TranslationState, TranslationActions } from "@/stores/translationStore";
import type { TranslateEngine, TranslationFallback } from "@/config";
import {
  applyPipelineStepActions,
  commitCompletedHistoryEntry,
  mapPipelineProgressMessage,
} from "./translationPipeline";
import type { PipelineStepKey } from "@/pages/TranslatePage/utils/pipelineTypes";

let pendingCtx: PendingCtx | null = null;

type PendingCtx = {
  sessionId: number;
  filePath: string;
  fileName: string;
  fileHash?: string;
  replaceHistoryId?: string;
  apiKey: string;
  sourceLang: Language;
  targetLang: Language;
  resolution: { width: number; height: number; size: number };
};

function failPipelineStep(
  get: () => TranslationState & TranslationActions,
  key: PipelineStepKey,
  error: string,
  detail?: string,
) {
  get().failPipelineStep(key, error, detail);
}

function failActivePipelineStep(
  get: () => TranslationState & TranslationActions,
  fallbackKey: PipelineStepKey,
  error: string,
) {
  failPipelineStep(get, get().activeStepKey ?? fallbackKey, error);
}

function completeActiveResultStep(get: () => TranslationState & TranslationActions) {
  const activeStepKey = get().activeStepKey;
  if (
    activeStepKey === "local-whisper" ||
    activeStepKey === "cloud-text-translate" ||
    activeStepKey === "local-llm-start" ||
    activeStepKey === "local-llm-translate"
  ) {
    get().completePipelineStep(activeStepKey, "字幕生成完成");
  }
}

// ── Exported helpers used by store actions ──

export function resetPipeline() {
  killSession();
  pendingCtx = null;
}

export function cancelPipeline() {
  killSession();
}

// ── Main pipeline entry ──

export function startPipeline(
  filePath: string,
  fileName: string,
  mode: "audio" | "video",
  apiKey: string,
  sourceLang: Language,
  targetLang: Language,
  engine: TranslateEngine = "cloud",
  whisperModelPath = "",
  translationFallback: TranslationFallback = "cloud-then-local",
  translateModelPath = "",
  fileHash?: string,
  replaceHistoryId?: string,
) {
  if (engine === "local") {
    startLocalPipeline(
      filePath,
      fileName,
      mode,
      apiKey,
      sourceLang,
      targetLang,
      whisperModelPath,
      translationFallback,
      translateModelPath,
      fileHash,
      replaceHistoryId,
    );
    return;
  }

  const store = useTranslationStore;
  const ss = newSession();
  const _set = (s: Partial<TranslationState>) => store.setState(s);
  const set = safeSet(ss, _set);
  const get = (): TranslationState & TranslationActions => store.getState();
  pendingCtx = null;

  get().initPipelineSteps({
    engine: "cloud",
    mode,
    sourceLang,
    targetLang,
    translationFallback,
  });
  get().activatePipelineStep("analyze-file", mode === "video" ? "检查文件..." : "分析文件中...");

  set({
    appStep: "processing",
    pipelinePhase: "extracting",
    videoFile: { name: fileName, path: filePath },
    progress: mode === "video" ? "检查文件..." : "分析文件中...",
    error: null,
    subtitleCount: 0,
    rawPreviewText: "",
    subtitleItems: [],
  });

  (async () => {
    try {
      let mediaFile = filePath;
      let mediaType: "audio" | "video" = mode;

      const meta = await probe(filePath);
      const sizeMB = (meta.size / 1024 / 1024).toFixed(1);
      get().completePipelineStep("analyze-file", formatMediaSummary(meta));

      if (meta.durationSeconds > MAX_DURATION_SECONDS) {
        showMessage({
          type: "error",
          title: `${mode === "video" ? "视频" : "音频"}过长，无法处理`,
          description: `时长 ${formatDuration(meta.durationSeconds)}，超过模型 3 小时上限。请分成多段后分别翻译。`,
          duration: 8000,
        });
        get().failPipelineStep(
          "analyze-file",
          `时长 ${formatDuration(meta.durationSeconds)}，超过模型 3 小时上限。`,
        );
        set({ appStep: "idle", error: null });
        return;
      }

      if (mode === "video") {
        get().activatePipelineStep("process-media", "检查视频大小");
        if (meta.size > MAX_DIRECT_UPLOAD_BYTES) {
          pendingCtx = {
            sessionId: ss.id,
            filePath,
            fileName,
            fileHash,
            replaceHistoryId,
            apiKey,
            sourceLang,
            targetLang,
            resolution: meta,
          };
          set({ progress: `${picks(meta.height).pass1Label} — 等待确认` });
          get().waitPipelineStep("process-media", `${picks(meta.height).pass1Label}，等待确认`);
          showModal("LargeVideo", {
            videoName: fileName,
            sizeMB,
            onCompress: () => {
              const c = pendingCtx;
              pendingCtx = null;
              if (c) runCompress(c);
            },
            onSwitchToAudio: () => {
              const c = pendingCtx;
              pendingCtx = null;
              if (c) runAudio(c);
            },
          });
          return;
        }
        set({ progress: `视频大小符合要求 (${sizeMB} MB)，直接上传` });
        get().completePipelineStep("process-media", `视频大小符合要求 (${sizeMB} MB)`);
      } else {
        get().activatePipelineStep("prepare-audio", "检查音频输入");
        const ext = filePath.split(".").pop()?.toLowerCase() || "";
        if (SUPPORTED_AUDIO_EXTS.includes(ext)) {
          set({ progress: `音频文件 (${sizeMB} MB)，直接上传` });
          get().skipPipelineStep("prepare-audio", `音频文件可直接上传 (${sizeMB} MB)`);
          mediaFile = filePath;
          mediaType = "audio";
        } else {
          set({ progress: "正在提取音频..." });
          const ap = await createTempPath("mp3");
          trackTemp(ss, ap);
          if (!(await runExtractAudio(filePath, ap, set))) {
            failActivePipelineStep(get, "prepare-audio", get().error || "音频提取失败");
            return;
          }
          mediaFile = ap;
          mediaType = "audio";
          set({ progress: "音频提取完成" });
          get().completePipelineStep("prepare-audio", "音频提取完成");
        }
      }

      if (!isAlive(ss)) return;
      await uploadAndTranslate(
        ss,
        mediaFile,
        mediaType,
        apiKey,
        sourceLang,
        targetLang,
        set,
        get,
        fileHash,
        replaceHistoryId,
      );
    } catch (err) {
      if (!isAlive(ss)) return;
      failActivePipelineStep(get, "analyze-file", err instanceof Error ? err.message : String(err));
      set({ error: err instanceof Error ? err.message : String(err), pipelinePhase: null });
    }
  })();
}

export function startLocalPipeline(
  filePath: string,
  fileName: string,
  mode: "audio" | "video",
  apiKey: string,
  sourceLang: Language,
  targetLang: Language,
  modelPath: string,
  translationFallback: TranslationFallback = "cloud-then-local",
  translateModelPath = "",
  fileHash?: string,
  replaceHistoryId?: string,
) {
  const store = useTranslationStore;
  const ss = newSession();
  const _set = (s: Partial<TranslationState>) => store.setState(s);
  const set = safeSet(ss, _set);
  const get = (): TranslationState & TranslationActions => store.getState();
  pendingCtx = null;

  get().initPipelineSteps({
    engine: "local",
    mode,
    sourceLang,
    targetLang,
    translationFallback,
  });
  get().activatePipelineStep("analyze-file", "准备本地识别...");

  set({
    appStep: "processing",
    pipelinePhase: "extracting",
    videoFile: { name: fileName, path: filePath },
    progress: "准备本地识别...",
    error: null,
    subtitleCount: 0,
    rawPreviewText: "",
    subtitleItems: [],
  });

  (async () => {
    try {
      if (!modelPath) {
        const message = "请先下载并选择 Whisper 本地模型。";
        get().failPipelineStep("local-whisper", message);
        set({ error: message, pipelinePhase: null });
        return;
      }
      if (sourceLang !== targetLang && translationFallback !== "local-only" && !apiKey) {
        const message = "本地跨语言翻译需要 DashScope API Key。";
        get().failPipelineStep("cloud-text-translate", message);
        set({ error: message, pipelinePhase: null });
        return;
      }
      if (
        sourceLang !== targetLang &&
        translationFallback === "local-only" &&
        !translateModelPath
      ) {
        const message = "请先下载并选择本地字幕翻译模型。";
        get().failPipelineStep("local-llm-start", message);
        set({ error: message, pipelinePhase: null });
        return;
      }

      const meta = await probe(filePath);
      get().completePipelineStep("analyze-file", formatMediaSummary(meta));
      if (meta.durationSeconds > MAX_DURATION_SECONDS) {
        showMessage({
          type: "error",
          title: `${mode === "video" ? "视频" : "音频"}过长，无法处理`,
          description: `时长 ${formatDuration(meta.durationSeconds)}，超过 3 小时上限。请分成多段后分别翻译。`,
          duration: 8000,
        });
        get().failPipelineStep(
          "analyze-file",
          `时长 ${formatDuration(meta.durationSeconds)}，超过 3 小时上限。`,
        );
        set({ appStep: "idle", error: null });
        return;
      }

      get().activatePipelineStep("prepare-local-audio", "准备 16kHz 单声道 WAV");
      const wavPath = await createTempPath("wav");
      trackTemp(ss, wavPath);
      if (!(await runExtractWav16kMono(filePath, wavPath, set))) {
        failPipelineStep(get, "prepare-local-audio", get().error || "本地识别音频准备失败");
        return;
      }
      if (!isAlive(ss)) return;
      get().completePipelineStep("prepare-local-audio", "本地识别音频已准备好");

      await localRecognizeAndTranslate(
        ss,
        wavPath,
        modelPath,
        mode,
        apiKey,
        sourceLang,
        targetLang,
        translationFallback,
        translateModelPath,
        set,
        get,
        fileHash,
        replaceHistoryId,
      );
    } catch (err) {
      if (!isAlive(ss)) return;
      const message = err instanceof Error ? err.message : String(err);
      failActivePipelineStep(get, "analyze-file", message);
      set({ error: message, pipelinePhase: null });
    }
  })();
}

// ── Modal callbacks ──

async function runCompress(ctx: PendingCtx) {
  const ss = requireSession(ctx.sessionId);
  if (!ss) return;

  const { filePath, apiKey, sourceLang, targetLang, resolution, fileHash, replaceHistoryId } = ctx;
  const store = useTranslationStore;
  const _set = (s: Partial<TranslationState>) => store.setState(s);
  const set = safeSet(ss, _set);
  const get = (): TranslationState & TranslationActions => store.getState();

  get().activatePipelineStep("process-media", "开始压缩视频");
  set({
    appStep: "processing",
    pipelinePhase: "extracting",
    progress: "开始压缩...",
    error: null,
    subtitleCount: 0,
    rawPreviewText: "",
    subtitleItems: [],
  });

  const { pass1Scale, pass1Label } = picks(resolution.height);
  set({ progress: pass1Label });
  const vp1 = await createTempPath("mp4");
  trackTemp(ss, vp1);

  if (
    !(await runFfmpeg(
      [
        "-i",
        filePath,
        "-vf",
        pass1Scale,
        "-r",
        "25",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        "-movflags",
        "+faststart",
        "-y",
        vp1,
      ],
      pass1Label,
      set,
    ))
  ) {
    failPipelineStep(get, "process-media", get().error || "视频压缩失败");
    return;
  }

  const s1 = (await invoke("get_file_info", { path: vp1 }).catch(() => ({ size: 0 }))) as {
    size: number;
  };
  if (s1.size <= MAX_DIRECT_UPLOAD_BYTES) {
    set({ progress: `压缩完成 (${(s1.size / 1048576).toFixed(1)} MB)` });
    get().completePipelineStep("process-media", `压缩完成 (${(s1.size / 1048576).toFixed(1)} MB)`);
    if (!isAlive(ss)) return;
    await uploadAndTranslate(
      ss,
      vp1,
      "video",
      apiKey,
      sourceLang,
      targetLang,
      set,
      get,
      fileHash,
      replaceHistoryId,
    );
    return;
  }

  set({ progress: `压缩后仍过大 (${(s1.size / 1048576).toFixed(1)} MB)，极限压缩 240p...` });
  const vp2 = await createTempPath("mp4");
  trackTemp(ss, vp2);
  if (
    !(await runFfmpeg(
      [
        "-i",
        filePath,
        "-vf",
        "scale=-2:240",
        "-r",
        "15",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "35",
        "-c:a",
        "aac",
        "-b:a",
        "48k",
        "-ac",
        "1",
        "-movflags",
        "+faststart",
        "-y",
        vp2,
      ],
      "极限压缩 240p 中...",
      set,
    ))
  ) {
    failPipelineStep(get, "process-media", get().error || "视频压缩失败");
    return;
  }

  const s2 = (await invoke("get_file_info", { path: vp2 }).catch(() => ({ size: 0 }))) as {
    size: number;
  };
  if (s2.size <= MAX_DIRECT_UPLOAD_BYTES) {
    set({ progress: `240p 压缩完成 (${(s2.size / 1048576).toFixed(1)} MB)` });
    get().completePipelineStep(
      "process-media",
      `240p 压缩完成 (${(s2.size / 1048576).toFixed(1)} MB)`,
    );
    if (!isAlive(ss)) return;
    await uploadAndTranslate(
      ss,
      vp2,
      "video",
      apiKey,
      sourceLang,
      targetLang,
      set,
      get,
      fileHash,
      replaceHistoryId,
    );
    return;
  }

  set({ progress: `压缩后仍过大 (${(s2.size / 1048576).toFixed(1)} MB)，转为音频提取...` });
  if (!isAlive(ss)) return;
  const ap = await createTempPath("mp3");
  trackTemp(ss, ap);
  if (!(await runExtractAudio(filePath, ap, set))) {
    failPipelineStep(get, "process-media", get().error || "音频提取失败");
    return;
  }
  if (!isAlive(ss)) return;
  get().completePipelineStep("process-media", "已转为音频上传");
  await uploadAndTranslate(
    ss,
    ap,
    "audio",
    apiKey,
    sourceLang,
    targetLang,
    set,
    get,
    fileHash,
    replaceHistoryId,
  );
}

async function runAudio(ctx: PendingCtx) {
  const ss = requireSession(ctx.sessionId);
  if (!ss) return;

  const { filePath, apiKey, sourceLang, targetLang, fileHash, replaceHistoryId } = ctx;
  const store = useTranslationStore;
  const _set = (s: Partial<TranslationState>) => store.setState(s);
  const set = safeSet(ss, _set);
  const get = (): TranslationState & TranslationActions => store.getState();

  get().activatePipelineStep("process-media", "切换为音频提取");
  set({
    appStep: "processing",
    pipelinePhase: "extracting",
    progress: "正在提取音频...",
    error: null,
    subtitleCount: 0,
    rawPreviewText: "",
    subtitleItems: [],
  });

  const ap = await createTempPath("mp3");
  trackTemp(ss, ap);
  if (!(await runExtractAudio(filePath, ap, set))) {
    failPipelineStep(get, "process-media", get().error || "音频提取失败");
    return;
  }
  if (!isAlive(ss)) return;
  set({ progress: "音频提取完成" });
  get().completePipelineStep("process-media", "音频提取完成");
  await uploadAndTranslate(
    ss,
    ap,
    "audio",
    apiKey,
    sourceLang,
    targetLang,
    set,
    get,
    fileHash,
    replaceHistoryId,
  );
}

// ── Shared: upload → translate ──

async function uploadAndTranslate(
  ss: PipelineSession,
  mediaFile: string,
  mediaType: "audio" | "video",
  apiKey: string,
  sourceLang: Language,
  targetLang: Language,
  set: (p: Partial<TranslationState>) => void,
  get: () => TranslationState & TranslationActions,
  fileHash?: string,
  replaceHistoryId?: string,
) {
  const uploadSize = (await invoke("get_file_info", { path: mediaFile }).catch(() => ({
    size: 0,
  }))) as { size: number };
  const uploadMB = (uploadSize.size / 1024 / 1024).toFixed(1);
  set({ pipelinePhase: "uploading", progress: `准备上传 (${uploadMB} MB)...` });
  get().activatePipelineStep("upload-media", `准备上传 (${uploadMB} MB)`);

  if (ss.unlisten) {
    ss.unlisten();
    ss.unlisten = null;
  }
  type TaskEvent<T> = { taskId: string; payload: T };
  const isCurrentEvent = (payload: TaskEvent<unknown>) => payload?.taskId === ss.taskId;

  const up = await listen<TaskEvent<string>>("translate-progress", (e) => {
    if (!isCurrentEvent(e.payload)) return;
    const message = String(e.payload.payload);
    set({ progress: message });
    applyPipelineStepActions(
      get(),
      mapPipelineProgressMessage(message, { route: get().pipelineRoute }),
    );
  });
  const uc = await listen<TaskEvent<string>>("translate-chunk", (e) => {
    if (!isCurrentEvent(e.payload)) return;
    ss.rawText += String(e.payload.payload);
    set({
      rawPreviewText: ss.rawText.length > 2000 ? "..." + ss.rawText.slice(-2000) : ss.rawText,
    });
  });
  const ue = await listen<TaskEvent<string>>("translate-error", (e) => {
    if (!isCurrentEvent(e.payload)) return;
    up();
    uc();
    ue();
    ud();
    ss.unlisten = null;
    const message = String(e.payload.payload);
    failPipelineStep(get, "cloud-media-translate", message);
    set({ error: message, pipelinePhase: null });
  });
  const ud = await listen<TaskEvent<null>>("translate-done", async (e) => {
    if (!isCurrentEvent(e.payload)) return;
    up();
    uc();
    ue();
    ud();
    ss.unlisten = null;
    if (!isAlive(ss)) return;
    get().completePipelineStep("cloud-media-translate", "云端识别与翻译完成");
    get().activatePipelineStep("parse-subtitles", "解析模型输出");
    const parsed = parseModelOutputWithWarnings(ss.rawText);
    const resolved = parsed.items;
    if (resolved.length === 0) {
      const message = ss.rawText.trim()
        ? "模型返回内容无法解析为 SRT，请重试或复制实时流内容手动处理。"
        : "模型未返回可用字幕内容。";
      get().failPipelineStep("parse-subtitles", message);
      set({
        error: message,
        rawPreviewText: ss.rawText,
        pipelinePhase: null,
      });
      return;
    }
    get().completePipelineStep("parse-subtitles", `解析出 ${resolved.length} 条字幕`);
    get().activatePipelineStep("save-history", "保存字幕和历史记录");

    await commitCompletedHistoryEntry({
      videoFile: get().videoFile,
      subtitleItems: resolved,
      sourceLang,
      targetLang,
      mediaType,
      fileHash,
      replaceHistoryId,
    });
    get().completePipelineStep("save-history", "结果已保存");

    useTranslationStore.setState(() => ({
      subtitleItems: resolved,
      subtitleCount: resolved.length,
      rawPreviewText: "",
      pipelinePhase: null,
      appStep: "preview",
    }));
  });
  ss.unlisten = () => {
    up();
    uc();
    ue();
    ud();
  };

  let ossUrl: string;
  try {
    ossUrl = (await invoke("upload_to_dashscope_oss", {
      taskId: ss.taskId,
      filePath: mediaFile,
      apiKey,
    })) as string;
  } catch (err) {
    if (ss.unlisten) {
      ss.unlisten();
      ss.unlisten = null;
    }
    const message = err instanceof Error ? err.message : String(err);
    failPipelineStep(get, "upload-media", message);
    set({ error: message, pipelinePhase: null });
    return;
  }

  // Clean up temp files after successful upload
  for (const p of ss.tempFiles) {
    invoke("delete_file", { path: p }).catch(() => {});
  }
  ss.tempFiles.length = 0;

  set({ pipelinePhase: "translating", progress: "AI 正在识别并翻译..." });
  get().completePipelineStep("upload-media", "媒体上传完成");
  get().activatePipelineStep("cloud-media-translate", "AI 正在识别并翻译...");

  try {
    await invoke("stream_translate", {
      req: { taskId: ss.taskId, ossUrl, apiKey, mediaType, sourceLang, targetLang },
    });
  } catch (err) {
    if (ss.unlisten) {
      up();
      uc();
      ue();
      ud();
      ss.unlisten = null;
    }
    if (!isAlive(ss)) return;
    const message = err instanceof Error ? err.message : String(err);
    failPipelineStep(get, "cloud-media-translate", message);
    set({ error: message, pipelinePhase: null });
  }
}

async function localRecognizeAndTranslate(
  ss: PipelineSession,
  wavPath: string,
  modelPath: string,
  mediaType: "audio" | "video",
  apiKey: string,
  sourceLang: Language,
  targetLang: Language,
  translationFallback: TranslationFallback,
  translateModelPath: string,
  set: (p: Partial<TranslationState>) => void,
  get: () => TranslationState & TranslationActions,
  fileHash?: string,
  replaceHistoryId?: string,
) {
  if (ss.unlisten) {
    ss.unlisten();
    ss.unlisten = null;
  }
  ss.rawText = "";
  type TaskEvent<T> = { taskId: string; payload: T };
  const isCurrentEvent = (payload: TaskEvent<unknown>) => payload?.taskId === ss.taskId;

  const up = await listen<TaskEvent<string>>("translate-progress", (e) => {
    if (!isCurrentEvent(e.payload)) return;
    const message = String(e.payload.payload);
    set({ progress: message });
    applyPipelineStepActions(
      get(),
      mapPipelineProgressMessage(message, { route: get().pipelineRoute }),
    );
  });
  const uc = await listen<TaskEvent<string>>("translate-chunk", (e) => {
    if (!isCurrentEvent(e.payload)) return;
    ss.rawText += String(e.payload.payload);
    set({
      rawPreviewText: ss.rawText.length > 2000 ? "..." + ss.rawText.slice(-2000) : ss.rawText,
    });
  });
  const ue = await listen<TaskEvent<string>>("translate-error", (e) => {
    if (!isCurrentEvent(e.payload)) return;
    up();
    uc();
    ue();
    ud();
    ss.unlisten = null;
    const message = String(e.payload.payload);
    failActivePipelineStep(get, "local-whisper", message);
    set({ error: message, pipelinePhase: null });
  });
  const ud = await listen<TaskEvent<null>>("translate-done", async (e) => {
    if (!isCurrentEvent(e.payload)) return;
    up();
    uc();
    ue();
    ud();
    ss.unlisten = null;
    if (!isAlive(ss)) return;

    for (const p of ss.tempFiles) {
      invoke("delete_file", { path: p }).catch(() => {});
    }
    ss.tempFiles.length = 0;

    completeActiveResultStep(get);
    get().activatePipelineStep("parse-subtitles", "解析模型输出");
    const parsed = parseModelOutputWithWarnings(ss.rawText);
    const resolved = parsed.items;
    if (resolved.length === 0) {
      const message = ss.rawText.trim()
        ? "本地管线返回内容无法解析为 SRT，请重试或复制实时流内容手动处理。"
        : "本地管线未返回可用字幕内容。";
      get().failPipelineStep("parse-subtitles", message);
      set({
        error: message,
        rawPreviewText: ss.rawText,
        pipelinePhase: null,
      });
      return;
    }
    get().completePipelineStep("parse-subtitles", `解析出 ${resolved.length} 条字幕`);
    get().activatePipelineStep("save-history", "保存字幕和历史记录");

    await commitCompletedHistoryEntry({
      videoFile: get().videoFile,
      subtitleItems: resolved,
      sourceLang,
      targetLang,
      mediaType,
      fileHash,
      replaceHistoryId,
    });
    get().completePipelineStep("save-history", "结果已保存");

    useTranslationStore.setState(() => ({
      subtitleItems: resolved,
      subtitleCount: resolved.length,
      rawPreviewText: "",
      pipelinePhase: null,
      appStep: "preview",
    }));
  });
  ss.unlisten = () => {
    up();
    uc();
    ue();
    ud();
  };

  set({
    pipelinePhase: "translating",
    progress: sourceLang === targetLang ? "本地语音识别中..." : "本地识别后将进行文本翻译...",
  });
  get().activatePipelineStep(
    "local-whisper",
    sourceLang === targetLang ? "本地语音识别中..." : "本地识别后将进行文本翻译...",
  );

  try {
    await invoke("local_pipeline_translate", {
      req: {
        taskId: ss.taskId,
        wavPath,
        modelPath,
        translateModelPath: translateModelPath || null,
        apiKey: apiKey || null,
        sourceLang,
        targetLang,
        translationFallback,
      },
    });
  } catch (err) {
    if (ss.unlisten) {
      up();
      uc();
      ue();
      ud();
      ss.unlisten = null;
    }
    if (!isAlive(ss)) return;
    const message = err instanceof Error ? err.message : String(err);
    failActivePipelineStep(get, "local-whisper", message);
    set({ error: message, pipelinePhase: null });
  }
}
