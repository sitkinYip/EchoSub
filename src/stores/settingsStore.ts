import { create } from "zustand";
import { Store } from "@tauri-apps/plugin-store";
import type { Language } from "@/types";
import type { Theme } from "@/config/theme";

interface SettingsState {
  apiKey: string;
  sourceLang: Language;
  targetLang: Language;
  uploadVideo: boolean;
  theme: Theme;
  loaded: boolean;

  load: () => Promise<void>;
  update: (partial: Partial<Pick<SettingsState, "apiKey" | "sourceLang" | "targetLang" | "uploadVideo" | "theme">>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  apiKey: "",
  sourceLang: "日语",
  targetLang: "中文",
  uploadVideo: false,
  theme: "dark",
  loaded: false,

  load: async () => {
    try {
      const store = await Store.load("config.json");
      const [apiKey, sourceLang, targetLang, uploadVideo, theme] = await Promise.all([
        store.get<string>("apiKey"),
        store.get<string>("sourceLang"),
        store.get<string>("targetLang"),
        store.get<boolean>("uploadVideo"),
        store.get<Theme>("theme"),
      ]);
      set({
        apiKey: apiKey || "",
        sourceLang: (sourceLang as Language) || "日语",
        targetLang: (targetLang as Language) || "中文",
        uploadVideo: uploadVideo ?? false,
        theme: theme || "dark",
        loaded: true,
      });
    } catch (err) {
      console.warn("无法加载配置:", err);
      set({ loaded: true });
    }
  },

  update: async (partial) => {
    set(partial);
    try {
      const store = await Store.load("config.json");
      const entries = Object.entries(partial) as [keyof typeof partial, unknown][];
      await Promise.all(entries.map(([k, v]) => store.set(k, v)));
      await store.save();
    } catch (err) {
      console.error("持久化设置失败:", err);
    }
  },
}));
