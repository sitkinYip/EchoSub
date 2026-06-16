import { create } from "zustand";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import type { Language } from "@/types";
import type { Theme } from "@/config/theme";

interface SettingsState {
  apiKey: string;
  hasApiKey: boolean;
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
  hasApiKey: false,
  sourceLang: "日语",
  targetLang: "中文",
  uploadVideo: false,
  theme: "dark",
  loaded: false,

  load: async () => {
    try {
      const store = await Store.load("config.json");
      const [sourceLang, targetLang, uploadVideo, theme] = await Promise.all([
        store.get<string>("sourceLang"),
        store.get<string>("targetLang"),
        store.get<boolean>("uploadVideo"),
        store.get<Theme>("theme"),
      ]);

      let apiKey = "";
      let hasApiKey = false;
      try {
        apiKey = await invoke("load_api_key") as string;
        hasApiKey = !!apiKey;
      } catch (err) {
        console.warn("无法加载 API Key:", err);
      }

      set({
        apiKey,
        hasApiKey,
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
    const errors: string[] = [];

    // Write apiKey to secure store FIRST
    if (partial.apiKey !== undefined) {
      try {
        await invoke("save_api_key", { key: partial.apiKey || "" });
      } catch (err) {
        errors.push(`API Key 保存失败: ${err instanceof Error ? err.message : err}`);
        delete partial.apiKey;
      }
    }

    // Write non-apiKey settings to config.json
    const configPartial: Record<string, unknown> = {};
    if (partial.sourceLang !== undefined) configPartial.sourceLang = partial.sourceLang;
    if (partial.targetLang !== undefined) configPartial.targetLang = partial.targetLang;
    if (partial.uploadVideo !== undefined) configPartial.uploadVideo = partial.uploadVideo;
    if (partial.theme !== undefined) configPartial.theme = partial.theme;

    if (Object.keys(configPartial).length > 0) {
      try {
        const store = await Store.load("config.json");
        await Promise.all(Object.entries(configPartial).map(([k, v]) => store.set(k, v)));
        await store.save();
      } catch (err) {
        errors.push(`配置保存失败: ${err instanceof Error ? err.message : err}`);
        for (const k of Object.keys(configPartial)) delete (partial as Record<string, unknown>)[k];
      }
    }

    // Update state with successfully-persisted values only
    set((s) => ({
      ...s,
      ...partial,
      ...(partial.apiKey !== undefined ? { hasApiKey: !!partial.apiKey } : {}),
    }));

    if (errors.length > 0) {
      console.error("设置保存出错:", errors.join("; "));
    }
  },
}));
