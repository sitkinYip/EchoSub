/** 一条字幕条目 */
export interface SubtitleItem {
  index: number;
  start: string; // "HH:MM:SS,mmm"
  end: string;   // "HH:MM:SS,mmm"
  text: string;
}

/** 支持的语言 */
export const LANGUAGES = ["中文", "日语", "韩语", "英语"] as const;
export type Language = (typeof LANGUAGES)[number];

/** 应用处理状态 */
export type ProcessingStep =
  | "idle"
  | "extracting"
  | "transcribing"
  | "translating"
  | "done"
  | "error";

/** 用户设置（持久化） */
export interface UserSettings {
  apiKey: string;
  sourceLang: Language;
  targetLang: Language;
}

/** 视频文件信息 */
export interface VideoFile {
  name: string;
  path: string;
}

/** ProcessingPanel 每个步骤的条目 */
export interface StepInfo {
  key: ProcessingStep;
  label: string;
}

/** API 流式响应片段 */
export interface ApiStreamChunk {
  content?: string;
  finish?: boolean;
}

/** Event payload from shell sidecar */
export interface SidecarEvent {
  type: "stdout" | "stderr";
  data: string;
}
