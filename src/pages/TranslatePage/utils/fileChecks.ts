import { invoke } from "@tauri-apps/api/core";
import { showMessage } from "@/components/Toast/create";
import { ALL_SUPPORTED_EXTS, SUPPORTED_AUDIO_EXTS } from "@/config";
import { useTranslationStore } from "@/stores/translationStore";
import { nextFrame } from "./frame";
import type { TranslateMode } from "./types";

export function resetCheckingState() {
  useTranslationStore.setState({ appStep: "idle", pipelinePhase: null });
}

export async function setCheckingFile(path: string, name: string) {
  useTranslationStore.setState({
    appStep: "processing",
    pipelinePhase: "extracting",
    videoFile: { name, path },
    progress: "正在检测文件...",
    error: null,
    subtitleCount: 0,
    rawPreviewText: "",
    subtitleItems: [],
  });
  await nextFrame();
}

export function getEffectiveMode(fileName: string, uploadVideo: boolean): TranslateMode | null {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (!ALL_SUPPORTED_EXTS.includes(ext)) {
    showMessage({
      type: "error",
      title: "不支持的文件格式",
      description: `".${ext}" 不在支持的格式列表中，请选择视频或音频文件。`,
    });
    return null;
  }

  return SUPPORTED_AUDIO_EXTS.includes(ext) ? "audio" : uploadVideo ? "video" : "audio";
}

export async function calculateFileHash(path: string) {
  useTranslationStore.setState({ progress: "正在生成文件指纹..." });
  return (await invoke("calculate_file_hash", { path })) as string;
}

export function showFileCheckError(err: unknown) {
  resetCheckingState();
  showMessage({
    type: "error",
    title: "文件校验失败",
    description: err instanceof Error ? err.message : String(err),
  });
}
