import type { TranslateEngine, TranslationFallback } from "@/config";
import type { Language } from "@/types";
import type { TranslateMode } from "./types";

export type PipelineRoute =
  | "cloud-audio"
  | "cloud-video"
  | "local-same-language"
  | "local-cloud-text"
  | "local-local-text"
  | "local-cloud-then-local-text";

export type PipelineStepStatus =
  | "pending"
  | "active"
  | "done"
  | "error"
  | "skipped"
  | "waiting"
  | "switched";

export type PipelineStepKey =
  | "analyze-file"
  | "prepare-audio"
  | "process-media"
  | "upload-media"
  | "cloud-media-translate"
  | "prepare-local-audio"
  | "local-whisper"
  | "cloud-text-translate"
  | "local-llm-start"
  | "local-llm-translate"
  | "parse-subtitles"
  | "save-history";

export type PipelineStep = {
  key: PipelineStepKey;
  label: string;
  description: string;
  status: PipelineStepStatus;
  detail?: string;
  error?: string;
};

export type PipelineRouteInput = {
  engine: TranslateEngine;
  mode: TranslateMode;
  sourceLang: Language;
  targetLang: Language;
  translationFallback: TranslationFallback;
};
