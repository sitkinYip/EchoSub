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
  sourceLang: Language;
  targetLang: Language;
  mode: "audio" | "video";
  subtitles: SubtitleItem[];
  status: "completed" | "error";
  error?: string;
  subtitleFilePath?: string;
}
