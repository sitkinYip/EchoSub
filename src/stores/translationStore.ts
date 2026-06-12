import { create } from "zustand";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { Command } from "@tauri-apps/plugin-shell";
import { listen } from "@tauri-apps/api/event";
import type { SubtitleItem, Language, HistoryEntry } from "@/types";
import { MAX_DIRECT_UPLOAD_BYTES } from "@/config";
import { parseModelOutput } from "@/utils/srtParser";

let mediaRef: { filePath: string; mediaType: "audio" | "video" } | null = null;
let unlistenRef: (() => void) | null = null;
let rawTextRef = "";

async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const store = await Store.load("history.json");
    return (await store.get<HistoryEntry[]>("entries")) || [];
  } catch { return []; }
}

async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  try {
    const store = await Store.load("history.json");
    await store.set("entries", entries);
    await store.save();
  } catch (err) { console.error("保存历史记录失败:", err); }
}

function makeEntry(state: TranslationState, sourceLang: Language, targetLang: Language,
  mediaType: "audio" | "video", status: "completed" | "error", error?: string): HistoryEntry {
  return {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
    videoName: state.videoFile?.name || "",
    videoPath: state.videoFile?.path || "",
    sourceLang, targetLang,
    mode: mediaType,
    subtitles: status === "completed" ? state.subtitleItems : [],
    status,
    ...(error ? { error } : {}),
  };
}

interface TranslationState {
  appStep: "idle" | "processing" | "preview";
  videoFile: { name: string; path: string } | null;
  isExtracting: boolean;
  extractProgress: string;
  extractionError: string | null;
  isTranslating: boolean;
  translationProgress: string;
  translationError: string | null;
  rawPreviewText: string;
  subtitleItems: SubtitleItem[];
  history: HistoryEntry[];
  historyLoaded: boolean;
  /** Pending regeneration request (set by history page, consumed by translate page) */
  regenerate: {
    videoPath: string;
    videoName: string;
    sourceLang: Language;
    targetLang: Language;
    uploadVideo: boolean;
  } | null;
}

interface TranslationActions {
  extract: (filePath: string, fileName: string, mode: "audio" | "video") => Promise<{ filePath: string; mediaType: "audio" | "video" } | null>;
  translate: (apiKey: string, filePath: string, mediaType: "audio" | "video", sourceLang: Language, targetLang: Language) => void;
  cancel: () => void;
  reset: () => void;
  updateSubtitleText: (index: number, text: string) => void;
  loadHistory: () => Promise<void>;
  deleteHistoryEntry: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  /** Replace all subtitles in a history entry (for modal editing) */
  updateHistorySubtitles: (historyId: string, subtitles: SubtitleItem[]) => Promise<void>;
  /** Set regeneration request then navigate to translate page */
  setRegenerate: (r: TranslationState["regenerate"]) => void;
  /** Clear regeneration request after consumption */
  clearRegenerate: () => void;
}

export const useTranslationStore = create<TranslationState & TranslationActions>((set, get) => ({
  appStep: "idle", videoFile: null,
  isExtracting: false, extractProgress: "", extractionError: null,
  isTranslating: false, translationProgress: "", translationError: null,
  rawPreviewText: "", subtitleItems: [],
  history: [], historyLoaded: false,
  regenerate: null,

  extract: async (filePath, fileName, mode) => {
    unlistenRef?.(); unlistenRef = null; mediaRef = null;
    set({ appStep: "processing", videoFile: { name: fileName, path: filePath },
      isExtracting: true, extractProgress: mode === "video" ? "检查文件..." : "正在提取音频...",
      extractionError: null, subtitleItems: [], rawPreviewText: "", translationError: null, isTranslating: false });

    try {
      if (mode === "video") {
        const info = await invoke<{ size: number }>("get_file_info", { path: filePath }).catch(() => ({ size: 0 }));
        if (info.size > MAX_DIRECT_UPLOAD_BYTES) {
          const sizeMB = (info.size / 1024 / 1024).toFixed(1);
          set({ extractProgress: `文件过大 (${sizeMB} MB)，自动切换为音频提取...` });
          const ap = filePath.replace(/\.[^.]+$/, "") + `_audio_${Date.now()}.mp3`;
          if (!await runFfmpeg(filePath, ap, set)) return null;
          return { filePath: ap, mediaType: "audio" as const };
        }
        set({ extractProgress: "视频文件已就绪（画面+语音混合识别）", isExtracting: false });
        return { filePath, mediaType: "video" as const };
      }
      set({ extractProgress: "正在提取音频..." });
      const ap = filePath.replace(/\.[^.]+$/, "") + `_audio_${Date.now()}.mp3`;
      if (!await runFfmpeg(filePath, ap, set)) return null;
      set({ extractProgress: "音频已就绪", isExtracting: false });
      return { filePath: ap, mediaType: "audio" as const };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ extractionError: msg, extractProgress: `错误: ${msg}`, isExtracting: false });
      return null;
    }
  },

  translate: (apiKey, filePath, mediaType, sourceLang, targetLang) => {
    unlistenRef?.(); unlistenRef = null;
    set({ isTranslating: true, translationError: null, subtitleItems: [], rawPreviewText: "", translationProgress: "" });
    rawTextRef = "";

    (async () => {
      try {
        const up = await listen<string>("translate-progress", (e) => set({ translationProgress: e.payload }));
        const uc = await listen<string>("translate-chunk", (e) => {
          rawTextRef += e.payload;
          set({ rawPreviewText: rawTextRef.length > 2000 ? "..." + rawTextRef.slice(-2000) : rawTextRef });
        });
        const ud = await listen("translate-done", async () => { up(); uc(); ud(); unlistenRef = null;
          const items = parseModelOutput(rawTextRef);
          set(items.length === 0 && rawTextRef.trim()
            ? { subtitleItems: [{ index: 1, start: "00:00:00,000", end: "00:00:00,000", text: rawTextRef.trim() }] }
            : { subtitleItems: items });
          set({ rawPreviewText: "", isTranslating: false, appStep: "preview" });
          const s = get();
          saveHistory([makeEntry(s, sourceLang, targetLang, mediaType, "completed"), ...s.history]);
          set({ history: [makeEntry(s, sourceLang, targetLang, mediaType, "completed"), ...s.history] });
        });
        unlistenRef = () => { up(); uc(); ud(); };
        await invoke("stream_translate_file", { req: { filePath, apiKey, mediaType, sourceLang, targetLang } });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        set({ translationError: msg, isTranslating: false });
        const s = get();
        saveHistory([makeEntry(s, sourceLang, targetLang, mediaType, "error", msg), ...s.history]);
        set({ history: [makeEntry(s, sourceLang, targetLang, mediaType, "error", msg), ...s.history] });
      }
    })();
  },

  cancel: () => { unlistenRef?.(); unlistenRef = null; set({ isTranslating: false }); },
  reset: () => {
    unlistenRef?.(); unlistenRef = null; mediaRef = null; rawTextRef = "";
    set({ appStep: "idle", videoFile: null, isExtracting: false, extractProgress: "", extractionError: null,
      isTranslating: false, translationProgress: "", translationError: null, rawPreviewText: "", subtitleItems: [] });
  },
  updateSubtitleText: (index, text) => set((s) => ({
    subtitleItems: s.subtitleItems.map((item) => item.index === index ? { ...item, text } : item),
  })),
  loadHistory: async () => { set({ history: await loadHistory(), historyLoaded: true }); },
  deleteHistoryEntry: async (id) => {
    const updated = get().history.filter((e) => e.id !== id);
    set({ history: updated }); await saveHistory(updated);
  },
  clearHistory: async () => { set({ history: [] }); await saveHistory([]); },

  updateHistorySubtitles: async (historyId, subtitles) => {
    const updated = get().history.map((e) =>
      e.id === historyId ? { ...e, subtitles } : e
    );
    set({ history: updated });
    await saveHistory(updated);
  },

  setRegenerate: (r) => set({ regenerate: r }),
  clearRegenerate: () => set({ regenerate: null }),
}));

async function runFfmpeg(videoPath: string, audioPath: string,
  set: (p: Partial<TranslationState>) => void): Promise<boolean> {
  let cmd;
  try {
    cmd = Command.sidecar("binaries/ffmpeg", ["-i", videoPath, "-b:a", "64k", "-ac", "1", "-y", audioPath]);
  } catch (e) {
    set({ extractionError: `无法启动 FFmpeg: ${e instanceof Error ? e.message : String(e)}`, extractProgress: "无法启动 FFmpeg", isExtracting: false });
    return false;
  }
  let buf = "";
  cmd.stderr.on("data", (d: string) => {
    buf += d;
    const m = d.match(/time=(\d+:\d+:\d+\.\d+)/);
    if (m) set({ extractProgress: `提取音频中... (${m[1]})` });
  });
  const r = await cmd.execute();
  if (r.code !== 0) {
    set({ extractionError: `FFmpeg 退出码 ${r.code}: ${buf.slice(-500) || "未知错误"}`, extractProgress: `FFmpeg 执行失败 (退出码 ${r.code})`, isExtracting: false });
    return false;
  }
  return true;
}
