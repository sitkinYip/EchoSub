import type { PipelineRoute, PipelineStepKey } from "./pipelineTypes";

export type PipelineStepCopy = {
  label: string;
  description: string;
};

export const PIPELINE_STEP_COPY = {
  "analyze-file": {
    label: "分析文件",
    description: "读取大小、时长和媒体信息",
  },
  "prepare-audio": {
    label: "准备音频",
    description: "必要时从媒体中提取音频轨道",
  },
  "process-media": {
    label: "处理视频",
    description: "检查大小，必要时压缩或切换音频",
  },
  "upload-media": {
    label: "上传媒体文件",
    description: "上传到云端临时存储供模型读取",
  },
  "cloud-media-translate": {
    label: "云端识别与翻译",
    description: "模型分析媒体内容并流式返回字幕",
  },
  "prepare-local-audio": {
    label: "准备本地音频",
    description: "转换为本地 Whisper 需要的 WAV 格式",
  },
  "local-whisper": {
    label: "本地语音识别",
    description: "使用 Whisper 在本机生成原文字幕",
  },
  "cloud-text-translate": {
    label: "云端文本翻译",
    description: "仅上传识别后的字幕文本进行翻译",
  },
  "local-llm-start": {
    label: "启动本地翻译模型",
    description: "准备 llama-server 和本地字幕翻译模型",
  },
  "local-llm-translate": {
    label: "本地字幕翻译",
    description: "用本地模型分批翻译识别后的字幕",
  },
  "parse-subtitles": {
    label: "解析字幕",
    description: "校验模型输出并转换为可编辑字幕",
  },
  "save-history": {
    label: "保存结果",
    description: "写入字幕缓存并加入历史记录",
  },
} satisfies Record<PipelineStepKey, PipelineStepCopy>;

export const PIPELINE_ROUTE_LABELS = {
  "cloud-audio": "云端音频流程",
  "cloud-video": "云端视频流程",
  "local-same-language": "本地识别流程",
  "local-cloud-text": "本地识别后云端文本翻译",
  "local-local-text": "本地识别后本地字幕翻译",
  "local-cloud-then-local-text": "本地识别后云端优先翻译",
} satisfies Record<PipelineRoute, string>;

export const PIPELINE_ROUTE_DESCRIPTIONS = {
  "cloud-audio": "媒体会上传到云端，由模型识别并翻译。",
  "cloud-video": "视频会上传到云端，过大时会先压缩或切换为音频。",
  "local-same-language": "音频只在本地识别，不需要额外翻译。",
  "local-cloud-text": "本地识别后，只把字幕文本发送到云端翻译。",
  "local-local-text": "识别和字幕翻译都在本机完成。",
  "local-cloud-then-local-text": "先尝试云端文本翻译，内容审核失败时切换本地翻译。",
} satisfies Record<PipelineRoute, string>;
