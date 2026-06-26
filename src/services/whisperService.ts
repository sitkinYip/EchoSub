import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type WhisperModel = {
  id: string;
  fileName: string;
  label: string;
  sizeMb: number;
  language: string;
  url: string;
  recommended: boolean;
};

export type TranslateModel = {
  id: string;
  fileName: string;
  label: string;
  sizeMb: number;
  language: string;
  url: string;
  recommended: boolean;
  note: string;
};

export type LocalWhisperModel = {
  id: string;
  fileName: string;
  path: string;
  size: number;
  label: string;
};

export type LocalTranslateModel = {
  id: string;
  fileName: string;
  path: string;
  size: number;
  label: string;
};

export type ModelDownloadProgress = {
  id: string;
  downloaded: number;
  total?: number | null;
  percent?: number | null;
};

export async function listWhisperModels(): Promise<WhisperModel[]> {
  return (await invoke("list_whisper_models")) as WhisperModel[];
}

export async function listTranslateModels(): Promise<TranslateModel[]> {
  return (await invoke("list_translate_models")) as TranslateModel[];
}

export async function getLocalWhisperModels(): Promise<LocalWhisperModel[]> {
  return (await invoke("get_local_whisper_models")) as LocalWhisperModel[];
}

export async function getLocalTranslateModels(): Promise<LocalTranslateModel[]> {
  return (await invoke("get_local_translate_models")) as LocalTranslateModel[];
}

export async function downloadWhisperModel(id: string): Promise<string> {
  return (await invoke("download_whisper_model", { id })) as string;
}

export async function downloadTranslateModel(id: string): Promise<string> {
  return (await invoke("download_translate_model", { id })) as string;
}

export async function deleteWhisperModel(path: string): Promise<void> {
  await invoke("delete_whisper_model", { path });
}

export async function deleteTranslateModel(path: string): Promise<void> {
  await invoke("delete_translate_model", { path });
}

export async function checkWhisperModelExists(id: string): Promise<boolean> {
  return (await invoke("check_whisper_model_exists", { id })) as boolean;
}

export async function checkTranslateModelExists(id: string): Promise<boolean> {
  return (await invoke("check_translate_model_exists", { id })) as boolean;
}

/**
 * VAD（语音活动检测）降噪模型。用于本地 ASR 前置过滤纯音乐/无人声段，
 * 过滤 [音乐] 等非语音内容。单一辅助模型，非多选一。
 * 下载进度事件 id 为 "vad"，可被 onModelDownloadProgress 捕获。
 */
export const VAD_MODEL_ID = "vad";

export async function checkVadModelExists(): Promise<boolean> {
  return (await invoke("check_vad_model_exists")) as boolean;
}

export async function downloadVadModel(): Promise<string> {
  return (await invoke("download_vad_model")) as string;
}

export function onModelDownloadProgress(
  handler: (progress: ModelDownloadProgress) => void,
): Promise<() => void> {
  return listen<ModelDownloadProgress>("model-download-progress", (event) =>
    handler(event.payload),
  );
}
