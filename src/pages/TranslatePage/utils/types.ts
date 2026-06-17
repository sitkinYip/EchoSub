import type { TranslateEngine, TranslationFallback } from "@/config";
import type { Language } from "@/types";

export type TranslateMode = "audio" | "video";

export type PendingFile = {
  name: string;
  path: string;
  hash?: string;
  replaceHistoryId?: string;
};

export type LanguageUpdate = {
  sourceLang?: Language;
  targetLang?: Language;
};

export type SettingsUpdate = {
  apiKey?: string;
  sourceLang?: Language;
  targetLang?: Language;
  uploadVideo?: boolean;
  engine?: TranslateEngine;
  translationFallback?: TranslationFallback;
  whisperModelId?: string;
  whisperModelPath?: string;
  translateModelId?: string;
  translateModelPath?: string;
};

export type UpdateSettings = (patch: SettingsUpdate) => Promise<void>;

export type StartTranslation = (
  filePath: string,
  fileName: string,
  forceMode?: TranslateMode,
  fileHash?: string,
  replaceHistoryId?: string,
) => Promise<void>;
