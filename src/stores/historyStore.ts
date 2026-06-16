import { create } from "zustand";
import type { HistoryEntry } from "@/types";
import { loadHistory, saveHistory } from "@/services/historyService";

interface HistoryState {
  history: HistoryEntry[];
  historyLoaded: boolean;

  load: () => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  updateSubtitles: (historyId: string, subtitles: HistoryEntry["subtitles"]) => Promise<void>;
  prepend: (entry: HistoryEntry) => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  history: [],
  historyLoaded: false,

  load: async () => {
    if (get().historyLoaded) return;
    set({ history: await loadHistory(), historyLoaded: true });
  },

  deleteEntry: async (id) => {
    const updated = get().history.filter((e) => e.id !== id);
    set({ history: updated });
    await saveHistory(updated);
  },

  clear: async () => { set({ history: [] }); await saveHistory([]); },

  updateSubtitles: async (historyId, subtitles) => {
    const updated = get().history.map((e) => e.id === historyId ? { ...e, subtitles } : e);
    set({ history: updated });
    await saveHistory(updated);
  },

  prepend: (entry) => {
    set((s) => {
      const newHistory = [entry, ...s.history];
      saveHistory(newHistory); // fire-and-forget
      return { history: newHistory };
    });
  },
}));
