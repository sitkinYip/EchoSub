import { create } from "zustand";
import type { SubtitleItem, Language } from "@/types";
import { startPipeline, resetPipeline, cancelPipeline } from "@/services/translateService";
import type { TranslateEngine, TranslationFallback } from "@/config";

export type PipelinePhase = "extracting" | "uploading" | "translating";

export interface TranslationState {
  appStep: "idle" | "processing" | "preview";
  pipelinePhase: PipelinePhase | null;
  videoFile: { name: string; path: string } | null;
  progress: string;
  error: string | null;
  subtitleCount: number;
  rawPreviewText: string;
  subtitleItems: SubtitleItem[];
  regenerate: {
    videoPath: string;
    videoName: string;
    fileHash?: string;
    replaceHistoryId?: string;
    sourceLang: Language;
    targetLang: Language;
    uploadVideo: boolean;
  } | null;
}

export interface TranslationActions {
  startPipeline: (
    filePath: string,
    fileName: string,
    mode: "audio" | "video",
    apiKey: string,
    sourceLang: Language,
    targetLang: Language,
    engine?: TranslateEngine,
    whisperModelPath?: string,
    translationFallback?: TranslationFallback,
    translateModelPath?: string,
    fileHash?: string,
    replaceHistoryId?: string,
  ) => void;
  cancel: () => void;
  reset: () => void;
  updateSubtitleText: (index: number, text: string) => void;
  setRegenerate: (r: TranslationState["regenerate"]) => void;
  clearRegenerate: () => void;
}

export const useTranslationStore = create<TranslationState & TranslationActions>((set) => ({
  appStep: "idle",
  pipelinePhase: null,
  videoFile: null,
  progress: "",
  error: null,
  subtitleCount: 0,
  rawPreviewText: "",
  subtitleItems: [],
  regenerate: null,

  startPipeline: (
    filePath,
    fileName,
    mode,
    apiKey,
    sourceLang,
    targetLang,
    engine,
    modelPath,
    translationFallback,
    translateModelPath,
    fileHash,
    replaceHistoryId,
  ) => {
    startPipeline(
      filePath,
      fileName,
      mode,
      apiKey,
      sourceLang,
      targetLang,
      engine,
      modelPath,
      translationFallback,
      translateModelPath,
      fileHash,
      replaceHistoryId,
    );
  },

  cancel: () => {
    cancelPipeline();
    set({ pipelinePhase: null, appStep: "idle" });
  },
  reset: () => {
    resetPipeline();
    set({
      appStep: "idle",
      pipelinePhase: null,
      videoFile: null,
      progress: "",
      error: null,
      subtitleCount: 0,
      rawPreviewText: "",
      subtitleItems: [],
    });
  },

  updateSubtitleText: (index, text) =>
    set((s) => ({
      subtitleItems: s.subtitleItems.map((item) =>
        item.index === index ? { ...item, text } : item,
      ),
    })),

  setRegenerate: (r) => set({ regenerate: r }),
  clearRegenerate: () => set({ regenerate: null }),
}));
