import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SubtitleItem, Language, HistoryEntry } from "@/types";
import { MAX_DIRECT_UPLOAD_BYTES, SUPPORTED_AUDIO_EXTS } from "@/config";
import { parseModelOutputWithWarnings, itemsToSrt } from "@/utils/srtParser";
import { showModal } from "@/components/Modal/create";
import { showMessage } from "@/components/Toast/create";
import { runFfmpeg, runExtractAudio } from "./ffmpegService";
import { probe, formatDuration, picks, MAX_DURATION_SECONDS } from "./mediaService";
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
import { useHistoryStore } from "@/stores/historyStore";
import type { TranslationState, TranslationActions } from "@/stores/translationStore";

let pendingCtx: PendingCtx | null = null;

type PendingCtx = {
  sessionId: number;
  filePath: string;
  fileName: string;
  apiKey: string;
  sourceLang: Language;
  targetLang: Language;
  resolution: { width: number; height: number; size: number };
};

function makeEntry(
  videoFile: { name: string; path: string } | null,
  subtitleItems: SubtitleItem[],
  sourceLang: Language,
  targetLang: Language,
  mediaType: "audio" | "video",
  status: "completed" | "error",
  error?: string,
  id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  subtitleFilePath?: string,
): HistoryEntry {
  return {
    id,
    createdAt: Date.now(),
    videoName: videoFile?.name || "",
    videoPath: videoFile?.path || "",
    sourceLang,
    targetLang,
    mode: mediaType,
    subtitles: status === "completed" ? subtitleItems : [],
    status,
    ...(error ? { error } : {}),
    ...(subtitleFilePath ? { subtitleFilePath } : {}),
  };
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
) {
  const store = useTranslationStore;
  const ss = newSession();
  const _set = (s: Partial<TranslationState>) => store.setState(s);
  const set = safeSet(ss, _set);
  const get = (): TranslationState & TranslationActions => store.getState();
  pendingCtx = null;

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

      if (meta.durationSeconds > MAX_DURATION_SECONDS) {
        showMessage({
          type: "error",
          title: `${mode === "video" ? "视频" : "音频"}过长，无法处理`,
          description: `时长 ${formatDuration(meta.durationSeconds)}，超过模型 3 小时上限。请分成多段后分别翻译。`,
          duration: 8000,
        });
        set({ appStep: "idle", error: null });
        return;
      }

      if (mode === "video") {
        if (meta.size > MAX_DIRECT_UPLOAD_BYTES) {
          pendingCtx = {
            sessionId: ss.id,
            filePath,
            fileName,
            apiKey,
            sourceLang,
            targetLang,
            resolution: meta,
          };
          set({ progress: `${picks(meta.height).pass1Label} — 等待确认` });
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
      } else {
        const ext = filePath.split(".").pop()?.toLowerCase() || "";
        if (SUPPORTED_AUDIO_EXTS.includes(ext)) {
          set({ progress: `音频文件 (${sizeMB} MB)，直接上传` });
          mediaFile = filePath;
          mediaType = "audio";
        } else {
          set({ progress: "正在提取音频..." });
          const ap = await createTempPath("mp3");
          trackTemp(ss, ap);
          if (!(await runExtractAudio(filePath, ap, set))) return;
          mediaFile = ap;
          mediaType = "audio";
          set({ progress: "音频提取完成" });
        }
      }

      if (!isAlive(ss)) return;
      await uploadAndTranslate(ss, mediaFile, mediaType, apiKey, sourceLang, targetLang, set, get);
    } catch (err) {
      if (!isAlive(ss)) return;
      set({ error: err instanceof Error ? err.message : String(err), pipelinePhase: null });
    }
  })();
}

// ── Modal callbacks ──

async function runCompress(ctx: PendingCtx) {
  const ss = requireSession(ctx.sessionId);
  if (!ss) return;

  const { filePath, apiKey, sourceLang, targetLang, resolution } = ctx;
  const store = useTranslationStore;
  const _set = (s: Partial<TranslationState>) => store.setState(s);
  const set = safeSet(ss, _set);
  const get = (): TranslationState & TranslationActions => store.getState();

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
  )
    return;

  const s1 = (await invoke("get_file_info", { path: vp1 }).catch(() => ({ size: 0 }))) as {
    size: number;
  };
  if (s1.size <= MAX_DIRECT_UPLOAD_BYTES) {
    set({ progress: `压缩完成 (${(s1.size / 1048576).toFixed(1)} MB)` });
    if (!isAlive(ss)) return;
    await uploadAndTranslate(ss, vp1, "video", apiKey, sourceLang, targetLang, set, get);
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
  )
    return;

  const s2 = (await invoke("get_file_info", { path: vp2 }).catch(() => ({ size: 0 }))) as {
    size: number;
  };
  if (s2.size <= MAX_DIRECT_UPLOAD_BYTES) {
    set({ progress: `240p 压缩完成 (${(s2.size / 1048576).toFixed(1)} MB)` });
    if (!isAlive(ss)) return;
    await uploadAndTranslate(ss, vp2, "video", apiKey, sourceLang, targetLang, set, get);
    return;
  }

  set({ progress: `压缩后仍过大 (${(s2.size / 1048576).toFixed(1)} MB)，转为音频提取...` });
  if (!isAlive(ss)) return;
  const ap = await createTempPath("mp3");
  trackTemp(ss, ap);
  if (!(await runExtractAudio(filePath, ap, set))) return;
  if (!isAlive(ss)) return;
  await uploadAndTranslate(ss, ap, "audio", apiKey, sourceLang, targetLang, set, get);
}

async function runAudio(ctx: PendingCtx) {
  const ss = requireSession(ctx.sessionId);
  if (!ss) return;

  const { filePath, apiKey, sourceLang, targetLang } = ctx;
  const store = useTranslationStore;
  const _set = (s: Partial<TranslationState>) => store.setState(s);
  const set = safeSet(ss, _set);
  const get = (): TranslationState & TranslationActions => store.getState();

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
  if (!(await runExtractAudio(filePath, ap, set))) return;
  if (!isAlive(ss)) return;
  set({ progress: "音频提取完成" });
  await uploadAndTranslate(ss, ap, "audio", apiKey, sourceLang, targetLang, set, get);
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
) {
  const uploadSize = (await invoke("get_file_info", { path: mediaFile }).catch(() => ({
    size: 0,
  }))) as { size: number };
  const uploadMB = (uploadSize.size / 1024 / 1024).toFixed(1);
  set({ pipelinePhase: "uploading", progress: `准备上传 (${uploadMB} MB)...` });

  if (ss.unlisten) {
    ss.unlisten();
    ss.unlisten = null;
  }
  type TaskEvent<T> = { taskId: string; payload: T };
  const isCurrentEvent = (payload: TaskEvent<unknown>) => payload?.taskId === ss.taskId;

  const up = await listen<TaskEvent<string>>("translate-progress", (e) => {
    if (!isCurrentEvent(e.payload)) return;
    set({ progress: String(e.payload.payload) });
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
    set({ error: String(e.payload.payload), pipelinePhase: null });
  });
  const ud = await listen<TaskEvent<null>>("translate-done", async (e) => {
    if (!isCurrentEvent(e.payload)) return;
    up();
    uc();
    ue();
    ud();
    ss.unlisten = null;
    if (!isAlive(ss)) return;
    const parsed = parseModelOutputWithWarnings(ss.rawText);
    const resolved = parsed.items;
    if (resolved.length === 0) {
      set({
        error: ss.rawText.trim()
          ? "模型返回内容无法解析为 SRT，请重试或复制实时流内容手动处理。"
          : "模型未返回可用字幕内容。",
        rawPreviewText: ss.rawText,
        pipelinePhase: null,
      });
      return;
    }

    // Atomic: push to history using a function updater, save atomically
    useTranslationStore.setState(() => ({
      subtitleItems: resolved,
      subtitleCount: resolved.length,
      rawPreviewText: "",
      pipelinePhase: null,
      appStep: "preview",
    }));

    const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    let subtitleFilePath: string | undefined;
    try {
      subtitleFilePath = (await invoke("write_subtitle_file", {
        id,
        content: itemsToSrt(resolved),
      })) as string;
    } catch (err) {
      showMessage({
        type: "warning",
        title: "字幕缓存保存失败",
        description: err instanceof Error ? err.message : String(err),
      });
    }
    const entry = makeEntry(
      get().videoFile,
      resolved,
      sourceLang,
      targetLang,
      mediaType,
      "completed",
      undefined,
      id,
      subtitleFilePath,
    );
    await useHistoryStore.getState().prepend(entry);
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
    set({ error: err instanceof Error ? err.message : String(err), pipelinePhase: null });
    return;
  }

  // Clean up temp files after successful upload
  for (const p of ss.tempFiles) {
    invoke("delete_file", { path: p }).catch(() => {});
  }
  ss.tempFiles.length = 0;

  set({ pipelinePhase: "translating", progress: "AI 正在识别并翻译..." });

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
    set({ error: err instanceof Error ? err.message : String(err), pipelinePhase: null });
  }
}
