import { useCallback } from "react";
import { showModal } from "@/components/Modal/create";
import { showMessage } from "@/components/Toast/create";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTranslationStore } from "@/stores/translationStore";
import { checkLocalModelGap } from "../utils/translationSettings";
import type { StartTranslation } from "../utils/types";
import type { TranslationOverrides } from "../utils/translationSettings";

/**
 * 合并全局设置与 override，返回本次翻译实际使用的完整参数。
 * override 字段优先；缺失字段回退全局。
 */
function resolveEffectiveSettings(overrides?: TranslationOverrides) {
  const s = useSettingsStore.getState();
  return {
    apiKey: s.apiKey,
    sourceLang: overrides?.sourceLang ?? s.sourceLang,
    targetLang: overrides?.targetLang ?? s.targetLang,
    uploadVideo: overrides?.uploadVideo ?? s.uploadVideo,
    engine: overrides?.engine ?? s.engine,
    translationFallback: overrides?.translationFallback ?? s.translationFallback,
    whisperModelId: overrides?.whisperModelId ?? s.whisperModelId,
    whisperModelPath: overrides?.whisperModelPath ?? s.whisperModelPath,
    translateModelId: overrides?.translateModelId ?? s.translateModelId,
    translateModelPath: overrides?.translateModelPath ?? s.translateModelPath,
  };
}

export function useTranslationStarter(): StartTranslation {
  const startPipeline = useTranslationStore((state) => state.startPipeline);

  const startWithCurrentSettings = useCallback<StartTranslation>(
    async (filePath, fileName, forceMode, fileHash, replaceHistoryId, overrides) => {
      const eff = resolveEffectiveSettings(overrides);
      const useSettings = useSettingsStore.getState();

      if (eff.engine === "local") {
        const validation = await useSettings.validateLocalModels();
        const gap = checkLocalModelGap({
          sourceLang: eff.sourceLang,
          targetLang: eff.targetLang,
          translationFallback: eff.translationFallback,
          whisperModelPath: eff.whisperModelPath,
          translateModelPath: eff.translateModelPath,
        });

        if (gap.missing) {
          useTranslationStore.setState({ appStep: "idle", pipelinePhase: null });
          if (validation.whisperCleared || validation.translateCleared) {
            showMessage({
              type: "warning",
              title: "本地模型已不可用",
              description: "已清空失效选择，请在模型管理器中重新选择或下载模型。",
            });
          }

          // override 场景下不写全局设置；把缺失信号抛回调用方
          // （regenerate 弹窗在确认前应已预检，这里理论上只在无 override 的新文件场景触发）
          if (overrides) {
            throw new ModelMissingError(gap.missing);
          }

          showModal("ModelManager", {
            initialTab: gap.missing === "whisper" ? "whisper" : "translate",
            selectedId: eff.whisperModelId,
            selectedPath: eff.whisperModelPath,
            selectedTranslateId: eff.translateModelId,
            selectedTranslatePath: eff.translateModelPath,
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

      const mode = forceMode || (eff.uploadVideo ? "video" : "audio");
      startPipeline(
        filePath,
        fileName,
        mode,
        eff.apiKey,
        eff.sourceLang,
        eff.targetLang,
        eff.engine,
        eff.whisperModelPath,
        eff.translationFallback,
        eff.translateModelPath,
        fileHash,
        replaceHistoryId,
        eff.whisperModelId,
        eff.translateModelId,
      );
    },
    [startPipeline],
  );

  return startWithCurrentSettings;
}

/**
 * override 场景下模型缺失时抛出。
 * regenerate 弹窗在确认前应已预检模型，正常流程不会触发；
 * 若触发，调用方捕获后可引导用户回弹窗选择模型。
 */
export class ModelMissingError extends Error {
  readonly missing: "whisper" | "translate";
  constructor(missing: "whisper" | "translate") {
    super(`local model missing: ${missing}`);
    this.name = "ModelMissingError";
    this.missing = missing;
  }
}
