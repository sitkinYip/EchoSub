import type { PipelineRoute } from "@/pages/TranslatePage/utils/pipelineTypes";
import { activateStep, completeStep, switchStep, type PipelineStepAction } from "./progressActions";

export type PipelineProgressEventContext = {
  route: PipelineRoute | null;
};

function isLocalRoute(route: PipelineRoute | null): boolean {
  return route !== null && route.startsWith("local-");
}

function isCloudMediaRoute(route: PipelineRoute | null): boolean {
  return route === "cloud-audio" || route === "cloud-video";
}

export function mapPipelineProgressMessage(
  message: string,
  context: PipelineProgressEventContext,
): PipelineStepAction[] {
  const trimmed = message.trim();

  if (!trimmed) return [];

  if (trimmed.includes("云端文本翻译触发内容审核")) {
    return [
      switchStep("cloud-text-translate", "内容审核未通过，已切换到本地字幕翻译"),
      activateStep("local-llm-start", trimmed),
    ];
  }

  if (trimmed.startsWith("正在翻译本地识别字幕")) {
    return [
      completeStep("local-whisper", "本地识别完成"),
      activateStep("cloud-text-translate", trimmed),
    ];
  }

  if (trimmed.startsWith("启动本地字幕翻译模型")) {
    return [
      completeStep("local-whisper", "本地识别完成"),
      activateStep("local-llm-start", trimmed),
    ];
  }

  if (trimmed.startsWith("本地字幕翻译中")) {
    return [
      completeStep("local-llm-start", "本地翻译模型已就绪"),
      activateStep("local-llm-translate", trimmed),
    ];
  }

  if (
    isLocalRoute(context.route) &&
    (trimmed.startsWith("加载音频中") ||
      trimmed.startsWith("加载本地模型中") ||
      trimmed.startsWith("本地语音识别中") ||
      trimmed.startsWith("识别中"))
  ) {
    return [activateStep("local-whisper", trimmed)];
  }

  if (
    isCloudMediaRoute(context.route) &&
    (trimmed.startsWith("正在上传文件") || trimmed.startsWith("上传中"))
  ) {
    return [activateStep("upload-media", trimmed)];
  }

  if (isCloudMediaRoute(context.route) && trimmed.startsWith("文件上传完成")) {
    return [
      completeStep("upload-media", "媒体上传完成"),
      activateStep("cloud-media-translate", trimmed),
    ];
  }

  if (isCloudMediaRoute(context.route) && trimmed.startsWith("AI 正在识别并翻译")) {
    return [
      completeStep("upload-media", "媒体上传完成"),
      activateStep("cloud-media-translate", trimmed),
    ];
  }

  return [];
}
