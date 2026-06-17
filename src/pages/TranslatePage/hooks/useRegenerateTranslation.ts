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

  useEffect(() => {
    if (!regenerate || appStep !== "idle" || !apiKey) return;
    update({
      sourceLang: regenerate.sourceLang,
      targetLang: regenerate.targetLang,
      uploadVideo: regenerate.uploadVideo,
    });
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
      );
    })().catch((err) => {
      useTranslationStore.setState({ appStep: "idle", pipelinePhase: null });
      showFileCheckError(err);
    });
  }, [apiKey, appStep, clearRegenerate, navigate, regenerate, reset, startTranslation, update]);
}
