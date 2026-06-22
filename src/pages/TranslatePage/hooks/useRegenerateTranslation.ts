import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { showModal } from "@/components/Modal/create";
import { useTranslationStore } from "@/stores/translationStore";
import type { TranslationState } from "@/stores/translationStore";
import {
  calculateFileHash,
  resetCheckingState,
  setCheckingFile,
  showFileCheckError,
} from "../utils/fileChecks";
import { findDuplicateEntry } from "../utils/historyDuplicate";
import type { StartTranslation, UpdateSettings } from "../utils/types";

type UseRegenerateTranslationOptions = {
  apiKey: string;
  appStep: TranslationState["appStep"];
  regenerate: TranslationState["regenerate"];
  clearRegenerate: () => void;
  reset: () => void;
  /** 保留以兼容 controller 调用；重新生成场景不再写全局设置 */
  update: UpdateSettings;
  startTranslation: StartTranslation;
};

export function useRegenerateTranslation({
  apiKey,
  appStep,
  regenerate,
  clearRegenerate,
  reset,
  update,
  startTranslation,
}: UseRegenerateTranslationOptions) {
  const navigate = useNavigate();
  // update 当前未使用：重新生成的设置通过 overrides 独立传递，不污染全局设置。
  void update;

  useEffect(() => {
    if (!regenerate || appStep !== "idle" || !apiKey) return;

    // 重新生成使用独立的 overrides，完全不写全局设置。
    // 语言和上传模式也走 override，保证本次会话隔离。
    const overrides = {
      engine: regenerate.engine,
      translationFallback: regenerate.translationFallback,
      whisperModelId: regenerate.whisperModelId,
      whisperModelPath: regenerate.whisperModelPath,
      translateModelId: regenerate.translateModelId,
      translateModelPath: regenerate.translateModelPath,
      sourceLang: regenerate.sourceLang,
      targetLang: regenerate.targetLang,
      uploadVideo: regenerate.uploadVideo,
    };

    clearRegenerate();
    reset();

    // History regeneration uses the same duplicate guard as new files, but passes
    // replaceHistoryId so the entry being regenerated can be overwritten.
    void (async () => {
      await setCheckingFile(regenerate.videoPath, regenerate.videoName);

      let fileHash = regenerate.fileHash;
      if (!fileHash) {
        fileHash = await calculateFileHash(regenerate.videoPath);
      }
      const mode = regenerate.uploadVideo ? "video" : "audio";
      const duplicate = await findDuplicateEntry(
        fileHash,
        mode,
        regenerate.sourceLang,
        regenerate.targetLang,
        regenerate.replaceHistoryId,
      );
      if (duplicate) {
        resetCheckingState();
        showModal("DuplicateTranslation", {
          entry: duplicate,
          onViewHistory: () => navigate("/history"),
          onRetranslate: () =>
            startTranslation(
              regenerate.videoPath,
              regenerate.videoName,
              mode,
              fileHash,
              regenerate.replaceHistoryId || duplicate.id,
              overrides,
            ),
        });
        return;
      }
      void startTranslation(
        regenerate.videoPath,
        regenerate.videoName,
        mode,
        fileHash,
        regenerate.replaceHistoryId,
        overrides,
      );
    })().catch((err) => {
      useTranslationStore.setState({ appStep: "idle", pipelinePhase: null });
      showFileCheckError(err);
    });
  }, [apiKey, appStep, clearRegenerate, navigate, regenerate, reset, startTranslation]);
}
