import { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { showModal } from "@/components/Modal/create";
import type { Language } from "@/types";
import {
  calculateFileHash,
  getEffectiveMode,
  resetCheckingState,
  setCheckingFile,
  showFileCheckError,
} from "../utils/fileChecks";
import { findDuplicateEntry } from "../utils/historyDuplicate";
import type { PendingFile, StartTranslation, UpdateSettings } from "../utils/types";

type UseIncomingFileTranslationOptions = {
  apiKey: string;
  sourceLang: Language;
  targetLang: Language;
  uploadVideo: boolean;
  engine: "cloud" | "local";
  translationFallback: "cloud-only" | "cloud-then-local" | "local-only";
  whisperModelId: string;
  whisperModelPath: string;
  translateModelId: string;
  translateModelPath: string;
  update: UpdateSettings;
  startTranslation: StartTranslation;
};

export function useIncomingFileTranslation({
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
}: UseIncomingFileTranslationOptions) {
  const navigate = useNavigate();
  const pendingRef = useRef<PendingFile | null>(null);

  return useCallback(
    async (filePath: string, fileName: string) => {
      const effectiveMode = getEffectiveMode(fileName, uploadVideo);
      if (!effectiveMode) return;

      await setCheckingFile(filePath, fileName);

      let fileHash: string;
      try {
        fileHash = await calculateFileHash(filePath);
      } catch (err) {
        showFileCheckError(err);
        return;
      }

      const duplicate = await findDuplicateEntry(fileHash, effectiveMode, sourceLang, targetLang);
      if (duplicate) {
        resetCheckingState();
        showModal("DuplicateTranslation", {
          entry: duplicate,
          onViewHistory: () => navigate("/history"),
          onRetranslate: () =>
            startTranslation(filePath, fileName, effectiveMode, fileHash, duplicate.id),
        });
        return;
      }

      const needsApiKey =
        engine === "cloud" || (sourceLang !== targetLang && translationFallback !== "local-only");
      if (engine === "local" && !whisperModelPath) {
        resetCheckingState();
        showModal("ModelManager", {
          initialTab: "whisper",
          selectedId: whisperModelId,
          selectedPath: whisperModelPath,
          selectedTranslateId: translateModelId,
          selectedTranslatePath: translateModelPath,
          onSelected: async (model: { id: string; path: string }) => {
            await update({ whisperModelId: model.id, whisperModelPath: model.path });
            void startTranslation(filePath, fileName, effectiveMode, fileHash);
          },
          onTranslateSelected: async (model: { id: string; path: string }) => {
            await update({ translateModelId: model.id, translateModelPath: model.path });
          },
        });
        return;
      }
      if (
        engine === "local" &&
        sourceLang !== targetLang &&
        translationFallback === "local-only" &&
        !translateModelPath
      ) {
        resetCheckingState();
        showModal("ModelManager", {
          initialTab: "translate",
          selectedId: whisperModelId,
          selectedPath: whisperModelPath,
          selectedTranslateId: translateModelId,
          selectedTranslatePath: translateModelPath,
          onSelected: async (model: { id: string; path: string }) => {
            await update({ whisperModelId: model.id, whisperModelPath: model.path });
          },
          onTranslateSelected: async (model: { id: string; path: string }) => {
            await update({ translateModelId: model.id, translateModelPath: model.path });
            void startTranslation(filePath, fileName, effectiveMode, fileHash);
          },
        });
        return;
      }
      if (needsApiKey && !apiKey) {
        resetCheckingState();
        pendingRef.current = { name: fileName, path: filePath, hash: fileHash };
        showModal("ApiKey", {
          onCancel: () => {
            pendingRef.current = null;
          },
          onSaved: async (key: string, src: Language, tgt: Language, uv: boolean) => {
            await update({ apiKey: key, sourceLang: src, targetLang: tgt, uploadVideo: uv });
            const pending = pendingRef.current;
            if (pending) {
              pendingRef.current = null;
              void startTranslation(
                pending.path,
                pending.name,
                effectiveMode,
                pending.hash,
                pending.replaceHistoryId,
              );
            }
          },
        });
        return;
      }

      pendingRef.current = null;
      void startTranslation(filePath, fileName, effectiveMode, fileHash);
    },
    [
      apiKey,
      engine,
      navigate,
      sourceLang,
      startTranslation,
      targetLang,
      translateModelId,
      translateModelPath,
      translationFallback,
      update,
      uploadVideo,
      whisperModelId,
      whisperModelPath,
    ],
  );
}
