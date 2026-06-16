import { useState, useEffect, useRef, useCallback } from "react";
import DropZone from "@/components/DropZone";
import SubtitlePreview from "@/components/SubtitlePreview";
import ExportButton from "@/components/ExportButton";
import ProcessingPanel from "@/components/ProcessingPanel";
import SettingsPopover from "@/components/SettingsPopover";
import LangSelect from "@/components/LangSelect";
import FilePill from "@/components/FilePill";
import Icon from "@/components/Icon";
import { showModal } from "@/components/Modal/create";
import { showMessage } from "@/components/Toast/create";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTranslationStore } from "@/stores/translationStore";
import { useHistoryStore } from "@/stores/historyStore";
import { LANGUAGES, SUPPORTED_AUDIO_EXTS, ALL_SUPPORTED_EXTS } from "@/config";
import type { Language, VideoFile } from "@/types";

export default function TranslatePage() {
  const s = useSettingsStore();
  const t = useTranslationStore();
  const { apiKey, hasApiKey, sourceLang, targetLang, uploadVideo, loaded, update } = s;
  const {
    appStep,
    pipelinePhase,
    videoFile,
    progress,
    error,
    subtitleCount,
    rawPreviewText,
    subtitleItems,
    startPipeline,
    reset,
    updateSubtitleText,
  } = t;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const pendingRef = useRef<VideoFile | null>(null);
  const modeLabel = uploadVideo ? "视频" : "音频";

  useEffect(() => {
    if (!loaded) s.load();
    useHistoryStore.getState().load();
  }, []);

  const doStart = useCallback(
    (fp: string, fn: string, forceMode?: "audio" | "video") => {
      const st = useSettingsStore.getState();
      const mode = forceMode || (st.uploadVideo ? "video" : "audio");
      startPipeline(fp, fn, mode, st.apiKey, st.sourceLang, st.targetLang);
    },
    [startPipeline],
  );

  // Handle regeneration from history
  useEffect(() => {
    const regen = t.regenerate;
    if (!regen || appStep !== "idle" || !apiKey) return;
    update({
      sourceLang: regen.sourceLang,
      targetLang: regen.targetLang,
      uploadVideo: regen.uploadVideo,
    });
    t.clearRegenerate();
    t.reset();
    doStart(regen.videoPath, regen.videoName, regen.uploadVideo ? "video" : "audio");
  }, [t.regenerate, apiKey, appStep, doStart, update]);

  const onFile = useCallback(
    (fp: string, fn: string) => {
      // Block unsupported formats
      const ext = fn.split(".").pop()?.toLowerCase() || "";
      if (!ALL_SUPPORTED_EXTS.includes(ext)) {
        showMessage({
          type: "error",
          title: "不支持的文件格式",
          description: `".${ext}" 不在支持的格式列表中，请选择视频或音频文件。`,
        });
        return;
      }
      // Audio-only files always go audio mode
      const isAudio = SUPPORTED_AUDIO_EXTS.includes(ext);
      if (!apiKey) {
        pendingRef.current = { name: fn, path: fp };
        showModal("ApiKey", {
          onCancel: () => {
            pendingRef.current = null;
          },
          onSaved: async (k: string, src: Language, tgt: Language, uv: boolean) => {
            await update({ apiKey: k, sourceLang: src, targetLang: tgt, uploadVideo: uv });
            const p = pendingRef.current;
            if (p) {
              pendingRef.current = null;
              doStart(p.path, p.name);
            }
          },
        });
        return;
      }
      pendingRef.current = null;
      doStart(fp, fn, isAudio ? "audio" : undefined);
    },
    [apiKey, doStart],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-8">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-app-text tracking-tight">字幕翻译</h1>
          <div className="flex items-center gap-2 ml-auto">
            <LangSelect
              value={sourceLang}
              onChange={(l) => update({ sourceLang: l })}
              options={LANGUAGES}
            />
            <Icon
              name="chevron-right"
              className="w-3.5 h-3.5 text-app-text-tertiary flex-shrink-0"
            />
            <LangSelect
              value={targetLang}
              onChange={(l) => update({ targetLang: l })}
              options={LANGUAGES}
            />

            {/* Upload mode toggle */}
            <div className="flex items-center">
              <button
                onClick={() => update({ uploadVideo: !uploadVideo })}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 active:scale-95
                  ${uploadVideo ? "bg-app-accent-bg text-app-accent ring-1 ring-app-accent-ring" : "bg-app-surface text-app-text-tertiary ring-1 ring-app-border-light hover:text-app-text-secondary"}`}
              >
                <Icon name="video" className="w-3 h-3" />
                {uploadVideo ? "视频模式" : "音频模式"}
              </button>
              <div className="relative ml-1.5 group">
                <Icon
                  name="help"
                  className="w-3.5 h-3.5 text-app-text-tertiary/40 hover:text-app-text-tertiary cursor-help transition-colors"
                />
                <div className="absolute top-full right-0 mt-2 w-52 px-3 py-2 rounded-xl bg-app-elevated ring-1 ring-app-border shadow-lg text-[11px] text-app-text-secondary leading-relaxed opacity-0 -translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 z-50">
                  {uploadVideo
                    ? "AI 通过分析视频画面与音频内容获得更精准的翻译结果。单文件不超过 1GB。"
                    : "仅提取视频中的音频轨道进行翻译，速度更快，适合纯语音内容。"}
                </div>
              </div>
            </div>

            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="relative ml-2 w-8 h-8 rounded-xl bg-app-surface hover:bg-app-hover ring-1 ring-app-border-light flex items-center justify-center transition-all duration-200 active:scale-95"
            >
              <Icon name="settings" className="w-4 h-4 text-app-text-secondary" />
              {!hasApiKey && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-app-error" />
              )}
            </button>
            {appStep !== "idle" && (
              <button
                onClick={reset}
                className="px-3 py-1.5 text-[11px] text-app-text-tertiary hover:text-app-text-secondary bg-app-surface hover:bg-app-hover rounded-lg transition-all duration-200"
              >
                重置
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-8 mt-8">
        <div className="max-w-3xl mx-auto pb-24">
          {appStep === "idle" && (
            <div className="flex items-center justify-center min-h-[300px]">
              <div className="w-full max-w-2xl">
                <DropZone onFileSelect={onFile} />
              </div>
            </div>
          )}

          {appStep === "processing" && (
            <div className="space-y-6">
              {videoFile && (
                <FilePill
                  name={videoFile.name}
                  sourceLang={sourceLang}
                  targetLang={targetLang}
                  mode={modeLabel}
                  onReset={reset}
                />
              )}
              <ProcessingPanel
                progressMessage={progress || (error ? "处理出错" : "")}
                pipelinePhase={pipelinePhase}
                subtitleCount={subtitleCount}
                onCancel={reset}
                hasError={error}
                isVideoMode={uploadVideo}
              />
              {pipelinePhase === "translating" && rawPreviewText && !subtitleItems.length && (
                <div className="rounded-2xl bg-app-surface-alt ring-1 ring-app-border p-5 max-h-64 overflow-y-auto">
                  <p className="text-xs text-app-text-tertiary mb-3 font-medium tracking-wide uppercase">
                    实时流
                  </p>
                  <pre className="text-sm text-app-text-secondary font-sans whitespace-pre-wrap break-words leading-relaxed">
                    {rawPreviewText}
                  </pre>
                </div>
              )}
              {subtitleItems.length > 0 && (
                <SubtitlePreview items={subtitleItems} onUpdateText={updateSubtitleText} />
              )}
            </div>
          )}

          {appStep === "preview" && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-app-success-bg ring-1 ring-app-success-ring">
                <div className="w-8 h-8 rounded-full bg-app-success-bg flex items-center justify-center">
                  <Icon name="check" className="w-4 h-4 text-app-success" />
                </div>
                <span className="text-sm text-app-success flex-1">
                  {videoFile?.name} — 翻译完成
                </span>
                <button
                  onClick={reset}
                  className="px-3 py-1.5 text-[11px] text-app-text-secondary hover:text-app-text bg-app-surface hover:bg-app-hover rounded-lg transition-all duration-200"
                >
                  处理新视频
                </button>
              </div>
              <SubtitlePreview items={subtitleItems} onUpdateText={updateSubtitleText} />
            </div>
          )}
        </div>
      </div>

      {appStep !== "idle" && (
        <div className="flex-shrink-0 px-8 py-4 bg-app-bg/80 backdrop-blur-xl border-t border-app-border-light">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            <span className="text-xs text-app-text-tertiary">
              {appStep === "processing"
                ? error
                  ? "处理出错"
                  : "处理中..."
                : `${subtitleItems.length} 条字幕`}
            </span>
            <ExportButton
              items={subtitleItems}
              disabled={appStep !== "preview"}
              videoFileName={videoFile?.name}
            />
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setSettingsOpen(false)}>
          <div
            className="absolute top-20 right-8 w-80 rounded-2xl bg-app-elevated ring-1 ring-app-border shadow-2xl p-5 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <SettingsPopover
              sourceLang={sourceLang}
              targetLang={targetLang}
              onSourceLangChange={(l) => update({ sourceLang: l })}
              onTargetLangChange={(l) => update({ targetLang: l })}
              apiKey={apiKey}
              onApiKeyChange={(k) => update({ apiKey: k })}
              onClose={() => setSettingsOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
