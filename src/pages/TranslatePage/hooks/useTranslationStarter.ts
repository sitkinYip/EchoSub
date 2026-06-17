import { useCallback } from "react";
import { showModal } from "@/components/Modal/create";
import { showMessage } from "@/components/Toast/create";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTranslationStore } from "@/stores/translationStore";
import type { StartTranslation } from "../utils/types";

export function useTranslationStarter(): StartTranslation {
  const startPipeline = useTranslationStore((state) => state.startPipeline);

  const startWithCurrentSettings = useCallback<StartTranslation>(
    async (filePath, fileName, forceMode, fileHash, replaceHistoryId) => {
      let currentSettings = useSettingsStore.getState();

      if (currentSettings.engine === "local") {
        const validation = await currentSettings.validateLocalModels();
        currentSettings = useSettingsStore.getState();
        const needsLocalTranslate =
          currentSettings.sourceLang !== currentSettings.targetLang &&
          currentSettings.translationFallback === "local-only";
        const modelMissing =
          !currentSettings.whisperModelPath ||
          (needsLocalTranslate && !currentSettings.translateModelPath);

        if (modelMissing) {
          useTranslationStore.setState({ appStep: "idle", pipelinePhase: null });
          if (validation.whisperCleared || validation.translateCleared) {
            showMessage({
              type: "warning",
              title: "本地模型已不可用",
              description: "已清空失效选择，请在模型管理器中重新选择或下载模型。",
            });
          }
          showModal("ModelManager", {
            initialTab: !currentSettings.whisperModelPath ? "whisper" : "translate",
            selectedId: currentSettings.whisperModelId,
            selectedPath: currentSettings.whisperModelPath,
            selectedTranslateId: currentSettings.translateModelId,
            selectedTranslatePath: currentSettings.translateModelPath,
            onSelected: async (model: { id: string; path: string }) => {
              await useSettingsStore
                .getState()
                .update({ whisperModelId: model.id, whisperModelPath: model.path });
              void startWithCurrentSettings(
                filePath,
                fileName,
                forceMode,
                fileHash,
                replaceHistoryId,
              );
            },
            onTranslateSelected: async (model: { id: string; path: string }) => {
              await useSettingsStore
                .getState()
                .update({ translateModelId: model.id, translateModelPath: model.path });
              void startWithCurrentSettings(
                filePath,
                fileName,
                forceMode,
                fileHash,
                replaceHistoryId,
              );
            },
          });
          return;
        }
      }

      const mode = forceMode || (currentSettings.uploadVideo ? "video" : "audio");
      startPipeline(
        filePath,
        fileName,
        mode,
        currentSettings.apiKey,
        currentSettings.sourceLang,
        currentSettings.targetLang,
        currentSettings.engine,
        currentSettings.whisperModelPath,
        currentSettings.translationFallback,
        currentSettings.translateModelPath,
        fileHash,
        replaceHistoryId,
      );
    },
    [startPipeline],
  );

  return startWithCurrentSettings;
}
