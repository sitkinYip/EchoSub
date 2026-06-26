export const LANGUAGES = ["中文", "日语", "韩语", "英语"] as const;

export const SUPPORTED_VIDEO_EXTS = ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm"];
export const SUPPORTED_AUDIO_EXTS = ["mp3", "wav", "aac", "ogg", "flac", "m4a", "wma"];
export const ALL_SUPPORTED_EXTS = [...SUPPORTED_VIDEO_EXTS, ...SUPPORTED_AUDIO_EXTS];

/** DashScope OSS 最大上传大小：1GB */
export const MAX_DIRECT_UPLOAD_BYTES = 1073741824; // 1GB

export const AUDIO_STEPS = [
  { key: "extract", label: "提取音频", description: "FFmpeg 从视频提取音频轨道" },
  { key: "upload", label: "上传文件", description: "上传至云端临时存储" },
  { key: "transcribe", label: "语音识别与翻译", description: "AI 识别语音内容并翻译" },
  { key: "generate", label: "生成字幕", description: "流式接收翻译结果并渲染" },
];

export const VIDEO_STEPS = [
  { key: "process", label: "文件处理", description: "检查文件大小，必要时压缩视频" },
  { key: "upload", label: "上传文件", description: "上传视频至云端临时存储" },
  { key: "transcribe", label: "识别与翻译", description: "AI 分析画面与语音并翻译" },
  { key: "generate", label: "生成字幕", description: "流式接收结果并渲染" },
];

/** 每个阶段对应的 pipeline phase */
export const STEP_TO_PHASE: Record<string, string | null> = {
  extract: "extracting",
  process: "extracting",
  upload: "uploading",
  transcribe: "translating",
  generate: "translating",
};

export const NAV_ITEMS: { path: string; label: string; icon: IconName }[] = [
  { path: "/", label: "翻译", icon: "translate" },
  { path: "/history", label: "历史", icon: "history" },
  { path: "/player", label: "播放器", icon: "player" },
];

export type TranslateEngine = "cloud" | "local";
export type TranslationFallback = "cloud-only" | "cloud-then-local" | "local-only";

export const ENGINE_LABELS: Record<TranslateEngine, string> = {
  cloud: "云端",
  local: "本地",
};

export const TRANSLATION_FALLBACK_LABELS: Record<TranslationFallback, string> = {
  "cloud-only": "仅云端",
  "cloud-then-local": "云端失败后本地",
  "local-only": "仅本地",
};

export type IconName =
  | "logo"
  | "translate"
  | "history"
  | "player"
  | "settings"
  | "download"
  | "download-cloud"
  | "trash"
  | "cpu"
  | "arrow-right"
  | "check"
  | "close"
  | "video"
  | "chevron-right"
  | "chevron-down"
  | "upload"
  | "chat"
  | "spinner"
  | "moon"
  | "sun"
  | "warning"
  | "help"
  | "waveform";
