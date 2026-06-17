import { create } from "zustand";
import type { SubtitleItem, Language } from "@/types";
import { startPipeline, resetPipeline, cancelPipeline } from "@/services/translateService";
import type { TranslateEngine, TranslationFallback } from "@/config";
import { createPipelineStepsForInput } from "@/pages/TranslatePage/utils/pipelineSteps";
import type {
  PipelineRoute,
  PipelineRouteInput,
  PipelineStep,
  PipelineStepKey,
  PipelineStepStatus,
} from "@/pages/TranslatePage/utils/pipelineTypes";

export type PipelinePhase = "extracting" | "uploading" | "translating";

type StepUpdate = {
  status: PipelineStepStatus;
  detail?: string;
  error?: string;
};

function updateStep(
  steps: PipelineStep[],
  key: PipelineStepKey,
  update: StepUpdate,
): PipelineStep[] {
  return steps.map((step) =>
    step.key === key
      ? {
          ...step,
          status: update.status,
          ...(update.detail !== undefined ? { detail: update.detail } : {}),
          ...(update.error !== undefined ? { error: update.error } : {}),
        }
      : step,
  );
}

export interface TranslationState {
  appStep: "idle" | "processing" | "preview";
  pipelinePhase: PipelinePhase | null;
  pipelineRoute: PipelineRoute | null;
  pipelineSteps: PipelineStep[];
  activeStepKey: PipelineStepKey | null;
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
  initPipelineSteps: (input: PipelineRouteInput) => void;
  activatePipelineStep: (key: PipelineStepKey, detail?: string) => void;
  completePipelineStep: (key: PipelineStepKey, detail?: string) => void;
  failPipelineStep: (key: PipelineStepKey, error: string, detail?: string) => void;
  skipPipelineStep: (key: PipelineStepKey, detail?: string) => void;
  waitPipelineStep: (key: PipelineStepKey, detail?: string) => void;
  switchPipelineStep: (key: PipelineStepKey, detail?: string) => void;
  setRegenerate: (r: TranslationState["regenerate"]) => void;
  clearRegenerate: () => void;
}

export const useTranslationStore = create<TranslationState & TranslationActions>((set) => ({
  appStep: "idle",
  pipelinePhase: null,
  pipelineRoute: null,
  pipelineSteps: [],
  activeStepKey: null,
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
    set({
      pipelinePhase: null,
      pipelineRoute: null,
      pipelineSteps: [],
      activeStepKey: null,
      appStep: "idle",
    });
  },
  reset: () => {
    resetPipeline();
    set({
      appStep: "idle",
      pipelinePhase: null,
      pipelineRoute: null,
      pipelineSteps: [],
      activeStepKey: null,
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

  initPipelineSteps: (input) =>
    set(() => {
      const { route, steps } = createPipelineStepsForInput(input);
      return {
        pipelineRoute: route,
        pipelineSteps: steps,
        activeStepKey: null,
      };
    }),

  activatePipelineStep: (key, detail) =>
    set((s) => ({
      activeStepKey: key,
      pipelineSteps: updateStep(s.pipelineSteps, key, {
        status: "active",
        detail,
        error: "",
      }),
    })),

  completePipelineStep: (key, detail) =>
    set((s) => ({
      activeStepKey: s.activeStepKey === key ? null : s.activeStepKey,
      pipelineSteps: updateStep(s.pipelineSteps, key, {
        status: "done",
        detail,
        error: "",
      }),
    })),

  failPipelineStep: (key, error, detail) =>
    set((s) => ({
      activeStepKey: key,
      pipelineSteps: updateStep(s.pipelineSteps, key, {
        status: "error",
        detail,
        error,
      }),
    })),

  skipPipelineStep: (key, detail) =>
    set((s) => ({
      activeStepKey: s.activeStepKey === key ? null : s.activeStepKey,
      pipelineSteps: updateStep(s.pipelineSteps, key, {
        status: "skipped",
        detail,
        error: "",
      }),
    })),

  waitPipelineStep: (key, detail) =>
    set((s) => ({
      activeStepKey: key,
      pipelineSteps: updateStep(s.pipelineSteps, key, {
        status: "waiting",
        detail,
        error: "",
      }),
    })),

  switchPipelineStep: (key, detail) =>
    set((s) => ({
      activeStepKey: s.activeStepKey === key ? null : s.activeStepKey,
      pipelineSteps: updateStep(s.pipelineSteps, key, {
        status: "switched",
        detail,
        error: "",
      }),
    })),

  setRegenerate: (r) => set({ regenerate: r }),
  clearRegenerate: () => set({ regenerate: null }),
}));
