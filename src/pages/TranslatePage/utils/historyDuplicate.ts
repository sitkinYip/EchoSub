import { useHistoryStore } from "@/stores/historyStore";
import type { HistoryEntry, Language } from "@/types";
import type { TranslateMode } from "./types";

export async function findDuplicateEntry(
  fileHash: string,
  mode: TranslateMode,
  source: Language,
  target: Language,
  replaceHistoryId?: string,
): Promise<HistoryEntry | null> {
  const historyStore = useHistoryStore.getState();
  await historyStore.load();

  // A regeneration may intentionally replace the current history row; only block other
  // completed rows with the same file and language pair.
  return (
    historyStore.history.find(
      (entry) =>
        entry.id !== replaceHistoryId &&
        entry.status === "completed" &&
        entry.fileHash === fileHash &&
        entry.mode === mode &&
        entry.sourceLang === source &&
        entry.targetLang === target,
    ) || null
  );
}
