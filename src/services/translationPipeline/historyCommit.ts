import { invoke } from "@tauri-apps/api/core";
import { showMessage } from "@/components/Toast/create";
import { useHistoryStore } from "@/stores/historyStore";
import type { TranslateEngine, TranslationFallback } from "@/config";
import type { HistoryEntry, Language, SubtitleItem } from "@/types";
import { itemsToSrt } from "@/utils/srtParser";

export type CreateHistoryEntryInput = {
  videoFile: { name: string; path: string } | null;
  subtitleItems: SubtitleItem[];
  sourceLang: Language;
  targetLang: Language;
  mediaType: "audio" | "video";
  status: "completed" | "error";
  error?: string;
  id?: string;
  subtitleFilePath?: string;
  fileHash?: string;
  /** 翻译引擎与模型设置，写入历史记录供重新生成回填 */
  engine?: TranslateEngine;
  translationFallback?: TranslationFallback;
  whisperModelId?: string;
  whisperModelPath?: string;
  translateModelId?: string;
  translateModelPath?: string;
};

export type CommitCompletedHistoryInput = Omit<
  CreateHistoryEntryInput,
  "status" | "error" | "id" | "subtitleFilePath"
> & {
  replaceHistoryId?: string;
};

export type CommitCompletedHistoryResult = {
  id: string;
  subtitleFilePath?: string;
  entry: HistoryEntry;
};

function createHistoryId(): string {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createHistoryEntry(input: CreateHistoryEntryInput): HistoryEntry {
  return {
    id: input.id ?? createHistoryId(),
    createdAt: Date.now(),
    videoName: input.videoFile?.name || "",
    videoPath: input.videoFile?.path || "",
    ...(input.fileHash ? { fileHash: input.fileHash } : {}),
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    mode: input.mediaType,
    subtitles: input.status === "completed" ? input.subtitleItems : [],
    status: input.status,
    ...(input.error ? { error: input.error } : {}),
    ...(input.subtitleFilePath ? { subtitleFilePath: input.subtitleFilePath } : {}),
    ...(input.engine ? { engine: input.engine } : {}),
    ...(input.translationFallback ? { translationFallback: input.translationFallback } : {}),
    ...(input.whisperModelId ? { whisperModelId: input.whisperModelId } : {}),
    ...(input.whisperModelPath ? { whisperModelPath: input.whisperModelPath } : {}),
    ...(input.translateModelId ? { translateModelId: input.translateModelId } : {}),
    ...(input.translateModelPath ? { translateModelPath: input.translateModelPath } : {}),
  };
}

export async function saveCompletedHistoryEntry(entry: HistoryEntry, replaceHistoryId?: string) {
  const historyStore = useHistoryStore.getState();
  if (replaceHistoryId) {
    await historyStore.replaceEntry(replaceHistoryId, entry);
  } else {
    await historyStore.prepend(entry);
  }
}

export async function commitCompletedHistoryEntry(
  input: CommitCompletedHistoryInput,
): Promise<CommitCompletedHistoryResult> {
  const id = createHistoryId();
  let subtitleFilePath: string | undefined;

  try {
    subtitleFilePath = (await invoke("write_subtitle_file", {
      id,
      content: itemsToSrt(input.subtitleItems),
    })) as string;
  } catch (err) {
    showMessage({
      type: "warning",
      title: "字幕缓存保存失败",
      description: err instanceof Error ? err.message : String(err),
    });
  }

  const entry = createHistoryEntry({
    ...input,
    id,
    status: "completed",
    subtitleFilePath,
  });

  await saveCompletedHistoryEntry(entry, input.replaceHistoryId);

  return {
    id,
    subtitleFilePath,
    entry,
  };
}
