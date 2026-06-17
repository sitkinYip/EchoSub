import { create } from "zustand";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import type { Language } from "@/types";
import type { Theme } from "@/config/theme";
import type { TranslateEngine, TranslationFallback } from "@/config";
import { checkTranslateModelExists, checkWhisperModelExists } from "@/services/whisperService";

export type LocalModelValidationResult = {
  whisperCleared: boolean;
  translateCleared: boolean;
};

interface SettingsState {
  apiKey: string;
  hasApiKey: boolean;
  sourceLang: Language;
  targetLang: Language;
  uploadVideo: boolean;
  engine: TranslateEngine;
  translationFallback: TranslationFallback;
  whisperModelId: string;
  whisperModelPath: string;
  translateModelId: string;
  translateModelPath: string;
  theme: Theme;
  loaded: boolean;

  load: () => Promise<void>;
  validateLocalModels: () => Promise<LocalModelValidationResult>;
  update: (
    partial: Partial<
      Pick<
        SettingsState,
        | "apiKey"
        | "sourceLang"
        | "targetLang"
        | "uploadVideo"
        | "engine"
        | "translationFallback"
        | "whisperModelId"
        | "whisperModelPath"
        | "translateModelId"
        | "translateModelPath"
        | "theme"
      >
    >,
  ) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  apiKey: "",
  hasApiKey: false,
  sourceLang: "日语",
  targetLang: "中文",
  uploadVideo: false,
  engine: "cloud",
  translationFallback: "cloud-then-local",
  whisperModelId: "base",
  whisperModelPath: "",
  translateModelId: "qwen3-4b-instruct-q4",
  translateModelPath: "",
  theme: "dark",
  loaded: false,

  load: async () => {
    try {
      const store = await Store.load("config.json");
      const [
        sourceLang,
        targetLang,
        uploadVideo,
        engine,
        translationFallback,
        whisperModelId,
        whisperModelPath,
        translateModelId,
        translateModelPath,
        theme,
      ] = await Promise.all([
        store.get<string>("sourceLang"),
        store.get<string>("targetLang"),
        store.get<boolean>("uploadVideo"),
        store.get<TranslateEngine>("engine"),
        store.get<TranslationFallback>("translationFallback"),
        store.get<string>("whisperModelId"),
        store.get<string>("whisperModelPath"),
        store.get<string>("translateModelId"),
        store.get<string>("translateModelPath"),
        store.get<Theme>("theme"),
      ]);

      let apiKey = "";
      let hasApiKey = false;
      try {
        apiKey = (await invoke("load_api_key")) as string;
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
        engine: engine || "cloud",
        translationFallback: translationFallback || "cloud-then-local",
        whisperModelId: whisperModelId || "base",
        whisperModelPath: whisperModelPath || "",
        translateModelId: translateModelId || "qwen3-4b-instruct-q4",
        translateModelPath: translateModelPath || "",
        theme: theme || "dark",
        loaded: true,
      });
      await get().validateLocalModels();
    } catch (err) {
      console.warn("无法加载配置:", err);
      set({ loaded: true });
    }
  },

  validateLocalModels: async () => {
    const state = get();
    const partial: Partial<
      Pick<
        SettingsState,
        "whisperModelId" | "whisperModelPath" | "translateModelId" | "translateModelPath"
      >
    > = {};
    let whisperCleared = false;
    let translateCleared = false;

    if (state.whisperModelPath) {
      try {
        const exists = await checkWhisperModelExists(state.whisperModelId);
        if (!exists) {
          partial.whisperModelId = "";
          partial.whisperModelPath = "";
          whisperCleared = true;
        }
      } catch (err) {
        console.warn("无法校验 Whisper 模型:", err);
      }
    }

    if (state.translateModelPath) {
      try {
        const exists = await checkTranslateModelExists(state.translateModelId);
        if (!exists) {
          partial.translateModelId = "";
          partial.translateModelPath = "";
          translateCleared = true;
        }
      } catch (err) {
        console.warn("无法校验翻译模型:", err);
      }
    }

    if (Object.keys(partial).length > 0) {
      await get().update(partial);
    }

    return { whisperCleared, translateCleared };
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
    if (partial.engine !== undefined) configPartial.engine = partial.engine;
    if (partial.translationFallback !== undefined) {
      configPartial.translationFallback = partial.translationFallback;
    }
    if (partial.whisperModelId !== undefined) configPartial.whisperModelId = partial.whisperModelId;
    if (partial.whisperModelPath !== undefined) {
      configPartial.whisperModelPath = partial.whisperModelPath;
    }
    if (partial.translateModelId !== undefined)
      configPartial.translateModelId = partial.translateModelId;
    if (partial.translateModelPath !== undefined) {
      configPartial.translateModelPath = partial.translateModelPath;
    }
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
