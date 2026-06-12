import type { Language } from "@/types";

export const LANGUAGES = ["中文", "日语", "韩语", "英语"] as const;

export const SUPPORTED_VIDEO_EXTS = ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm"];

export const MAX_DIRECT_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB

export const AUDIO_STEPS = [
  { key: "extract", label: "提取音频", description: "FFmpeg 从视频提取音频轨道" },
  { key: "upload", label: "上传文件", description: "上传至云端临时存储" },
  { key: "transcribe", label: "语音识别与翻译", description: "AI 识别语音内容并翻译" },
  { key: "generate", label: "生成字幕", description: "流式接收翻译结果并渲染" },
];

export const VIDEO_STEPS = [
  { key: "upload", label: "上传文件", description: "上传视频至云端临时存储" },
  { key: "transcribe", label: "识别与翻译", description: "AI 分析画面与语音并翻译" },
  { key: "generate", label: "生成字幕", description: "流式接收结果并渲染" },
];

export const NAV_ITEMS: { path: string; label: string; icon: IconName }[] = [
  { path: "/", label: "翻译", icon: "translate" },
  { path: "/history", label: "历史", icon: "history" },
  { path: "/player", label: "播放器", icon: "player" },
];

export type IconName =
  | "logo" | "translate" | "history" | "player" | "settings" | "download"
  | "arrow-right" | "check" | "close" | "video" | "chevron-right"
  | "upload" | "chat" | "spinner" | "moon" | "sun" | "warning";
