import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { HistoryEntry } from "@/types";
import { loadHistory, saveHistory } from "@/services/historyService";
import { itemsToSrt } from "@/utils/srtParser";
import { showMessage } from "@/components/Toast/create";

interface HistoryState {
  history: HistoryEntry[];
  historyLoaded: boolean;

  load: () => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  updateSubtitles: (historyId: string, subtitles: HistoryEntry["subtitles"]) => Promise<void>;
  prepend: (entry: HistoryEntry) => Promise<void>;
  replaceEntry: (historyId: string, entry: HistoryEntry) => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  history: [],
  historyLoaded: false,

  load: async () => {
    if (get().historyLoaded) return;
    set({ history: await loadHistory(), historyLoaded: true });
  },

  deleteEntry: async (id) => {
    const entry = get().history.find((e) => e.id === id);
    const updated = get().history.filter((e) => e.id !== id);
    set({ history: updated });
    try {
      await saveHistory(updated);
      if (entry?.subtitleFilePath) {
        await invoke("delete_subtitle_file", { path: entry.subtitleFilePath }).catch(() => {});
      }
    } catch (err) {
      showMessage({
        type: "error",
        title: "历史记录保存失败",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  },

  clear: async () => {
    const old = get().history;
    set({ history: [] });
    try {
      await saveHistory([]);
      await Promise.all(
        old.map((entry) =>
          entry.subtitleFilePath
            ? invoke("delete_subtitle_file", { path: entry.subtitleFilePath }).catch(() => {})
            : Promise.resolve(),
        ),
      );
    } catch (err) {
      showMessage({
        type: "error",
        title: "历史记录保存失败",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  },

  updateSubtitles: async (historyId, subtitles) => {
    const current = get().history.find((e) => e.id === historyId);
    let subtitleFilePath = current?.subtitleFilePath;
    if (current) {
      try {
        subtitleFilePath = (await invoke("write_subtitle_file", {
          id: current.id,
          content: itemsToSrt(subtitles),
        })) as string;
      } catch (err) {
        showMessage({
          type: "warning",
          title: "字幕缓存保存失败",
          description: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const updated = get().history.map((e) =>
      e.id === historyId ? { ...e, subtitles, subtitleFilePath } : e,
    );
    set({ history: updated });
    try {
      await saveHistory(updated);
    } catch (err) {
      showMessage({
        type: "error",
        title: "历史记录保存失败",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  },

  prepend: async (entry) => {
    let nextHistory: HistoryEntry[] = [];
    set((s) => {
      const newHistory = [entry, ...s.history];
      nextHistory = newHistory;
      return { history: newHistory };
    });
    try {
      await saveHistory(nextHistory);
    } catch (err) {
      showMessage({
        type: "error",
        title: "历史记录保存失败",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  },

  replaceEntry: async (historyId, entry) => {
    let oldEntry: HistoryEntry | undefined;
    let nextHistory: HistoryEntry[] = [];
    set((s) => {
      oldEntry = s.history.find((item) => item.id === historyId);
      const filtered = s.history.filter((item) => item.id !== historyId);
      nextHistory = [entry, ...filtered];
      return { history: nextHistory };
    });
    try {
      await saveHistory(nextHistory);
      if (oldEntry?.subtitleFilePath && oldEntry.subtitleFilePath !== entry.subtitleFilePath) {
        await invoke("delete_subtitle_file", { path: oldEntry.subtitleFilePath }).catch(() => {});
      }
    } catch (err) {
      showMessage({
        type: "error",
        title: "历史记录保存失败",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  },
}));
