import type { TranslateEngine, TranslationFallback } from "@/config";

export interface SubtitleItem {
  index: number;
  start: string;
  end: string;
  text: string;
}

export type Language = "中文" | "日语" | "韩语" | "英语";

export interface VideoFile {
  name: string;
  path: string;
}

export interface HistoryEntry {
  id: string;
  createdAt: number;
  videoName: string;
  videoPath: string;
  fileHash?: string;
  sourceLang: Language;
  targetLang: Language;
  mode: "audio" | "video";
  subtitles: SubtitleItem[];
  status: "completed" | "error";
  error?: string;
  subtitleFilePath?: string;
  /** 翻译引擎与模型设置，老历史记录可能缺失，重新生成时降级到全局设置 */
  engine?: TranslateEngine;
  translationFallback?: TranslationFallback;
  whisperModelId?: string;
  whisperModelPath?: string;
  translateModelId?: string;
  translateModelPath?: string;
}
