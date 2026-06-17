import { useState, useEffect } from "react";
import { useHistoryStore } from "@/stores/historyStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTranslationStore } from "@/stores/translationStore";
import { useIncomingFileTranslation } from "./useIncomingFileTranslation";
import { useRegenerateTranslation } from "./useRegenerateTranslation";
import { useTranslationStarter } from "./useTranslationStarter";

export function useTranslatePageController() {
  const settings = useSettingsStore();
  const translation = useTranslationStore();
  const {
    apiKey,
    sourceLang,
    targetLang,
    uploadVideo,
    engine,
    translationFallback,
    whisperModelId,
    whisperModelPath,
    translateModelId,
    translateModelPath,
    loaded,
    update,
  } = settings;
  const { appStep, regenerate, clearRegenerate, reset } = translation;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const startTranslation = useTranslationStarter();

  useEffect(() => {
    if (!loaded) useSettingsStore.getState().load();
    useHistoryStore.getState().load();
  }, [loaded]);

  useRegenerateTranslation({
    apiKey,
    appStep,
    regenerate,
    clearRegenerate,
    reset,
    update,
    startTranslation,
  });

  const onFile = useIncomingFileTranslation({
    apiKey,
    sourceLang,
    targetLang,
    uploadVideo,
    engine,
    translationFallback,
    whisperModelId,
    whisperModelPath,
    translateModelId,
    translateModelPath,
    update,
    startTranslation,
  });

  return {
    settings,
    translation,
    settingsOpen,
    modeLabel: uploadVideo ? "视频" : "音频",
    onFile,
    onSettingsOpenChange: setSettingsOpen,
  };
}
