import React, { useState, useEffect, useRef, useCallback } from "react";
import DropZone from "@/components/DropZone";
import SubtitlePreview from "@/components/SubtitlePreview";
import ExportButton from "@/components/ExportButton";
import ProcessingPanel from "@/components/ProcessingPanel";
import SettingsPopover from "@/components/SettingsPopover";
import LangSelect from "@/components/LangSelect";
import FilePill from "@/components/FilePill";
import Icon from "@/components/Icon";
import { showModal } from "@/components/Modal/create";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTranslationStore } from "@/stores/translationStore";
import { LANGUAGES } from "@/config";
import type { Language, VideoFile } from "@/types";

export default function TranslatePage() {
  const s = useSettingsStore();
  const t = useTranslationStore();
  const { apiKey, sourceLang, targetLang, uploadVideo, loaded, update } = s;
  const { appStep, videoFile, isExtracting, isTranslating, extractProgress, translationProgress,
    extractionError, translationError, rawPreviewText, subtitleItems,
    extract, translate, reset, updateSubtitleText } = t;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const pendingRef = useRef<VideoFile | null>(null);
  const err = extractionError || translationError;
  const mode = uploadVideo ? "视频" : "音频";

  useEffect(() => { if (!loaded) s.load(); if (!t.historyLoaded) t.loadHistory(); }, []); // eslint-disable-line

  const startPipeline = useCallback(async (fp: string, fn: string) => {
    const st = useSettingsStore.getState();
    const r = await extract(fp, fn, st.uploadVideo ? "video" : "audio");
    if (r) {
      const st2 = useSettingsStore.getState();
      translate(st2.apiKey, r.filePath, r.mediaType, st2.sourceLang, st2.targetLang);
    }
  }, [extract, translate]);

  // Handle regeneration from history page
  useEffect(() => {
    const regen = t.regenerate;
    if (!regen || appStep !== "idle" || !apiKey) return;
    update({ sourceLang: regen.sourceLang, targetLang: regen.targetLang, uploadVideo: regen.uploadVideo });
    t.clearRegenerate();
    t.reset();
    startPipeline(regen.videoPath, regen.videoName);
  }, [t.regenerate, apiKey, appStep, startPipeline, update]);

  // Watch apiKey: when it becomes set and a pending file exists, start pipeline
  useEffect(() => {
    const pending = pendingRef.current;
    if (apiKey && pending && appStep === "idle") {
      pendingRef.current = null;
      startPipeline(pending.path, pending.name);
    }
  }, [apiKey, appStep, startPipeline]);

  const onFile = useCallback((fp: string, fn: string) => {
    if (!apiKey) {
      pendingRef.current = { name: fn, path: fp };
      showModal("ApiKey");
      return;
    }
    pendingRef.current = null;
    startPipeline(fp, fn);
  }, [apiKey, startPipeline]);

  const progressMsg = isTranslating
    ? translationProgress || (rawPreviewText.length > 0 ? `翻译中... 已收到 ${rawPreviewText.length} 字符` : "正在等待 AI 首次响应...")
    : extractProgress || (err ? "处理出错" : "");

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-8">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-app-text tracking-tight">字幕翻译</h1>
          <div className="flex items-center gap-2 ml-auto">
            <LangSelect value={sourceLang} onChange={(l) => update({ sourceLang: l as Language })} options={LANGUAGES} />
            <Icon name="chevron-right" className="w-3.5 h-3.5 text-app-text-tertiary flex-shrink-0" />
            <LangSelect value={targetLang} onChange={(l) => update({ targetLang: l as Language })} options={LANGUAGES} />
            <button onClick={() => setSettingsOpen(!settingsOpen)} className="relative ml-2 w-8 h-8 rounded-xl bg-app-surface hover:bg-app-hover ring-1 ring-app-border-light flex items-center justify-center transition-all duration-200 active:scale-95">
              <Icon name="settings" className="w-4 h-4 text-app-text-secondary" />
              {!apiKey && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-app-error" />}
            </button>
            {appStep !== "idle" && <button onClick={reset} className="px-3 py-1.5 text-[11px] text-app-text-tertiary hover:text-app-text-secondary bg-app-surface hover:bg-app-hover rounded-lg transition-all duration-200">重置</button>}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-8 mt-8">
        <div className="max-w-3xl mx-auto pb-24">
          {appStep === "idle" && <div className="flex items-center justify-center min-h-[300px]"><div className="w-full max-w-2xl"><DropZone onFileSelect={onFile} /></div></div>}

          {appStep === "processing" && (<div className="space-y-6">{videoFile && <FilePill name={videoFile.name} sourceLang={sourceLang} targetLang={targetLang} mode={mode} onReset={reset} />}
            <ProcessingPanel progressMessage={progressMsg} isExtracting={isExtracting} isTranslating={isTranslating} subtitleCount={subtitleItems.length} onCancel={reset} hasError={err} isVideoMode={uploadVideo} />
            {isTranslating && rawPreviewText && !subtitleItems.length && (
              <div className="rounded-2xl bg-app-surface-alt ring-1 ring-app-border p-5 max-h-64 overflow-y-auto"><p className="text-xs text-app-text-tertiary mb-3 font-medium tracking-wide uppercase">实时流</p><pre className="text-sm text-app-text-secondary font-sans whitespace-pre-wrap break-words leading-relaxed">{rawPreviewText}</pre></div>)}
            {subtitleItems.length > 0 && <SubtitlePreview items={subtitleItems} onUpdateText={updateSubtitleText} />}
          </div>)}

          {appStep === "preview" && (<div className="space-y-6">
            <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-app-success-bg ring-1 ring-app-success-ring">
              <div className="w-8 h-8 rounded-full bg-app-success-bg flex items-center justify-center"><Icon name="check" className="w-4 h-4 text-app-success" /></div>
              <span className="text-sm text-app-success flex-1">{videoFile?.name} — 翻译完成</span>
              <button onClick={reset} className="px-3 py-1.5 text-[11px] text-app-text-secondary hover:text-app-text bg-app-surface hover:bg-app-hover rounded-lg transition-all duration-200">处理新视频</button>
            </div>
            <SubtitlePreview items={subtitleItems} onUpdateText={updateSubtitleText} />
          </div>)}
        </div>
      </div>

      {appStep !== "idle" && (<div className="flex-shrink-0 px-8 py-4 bg-app-bg/80 backdrop-blur-xl border-t border-app-border-light"><div className="flex items-center justify-between max-w-3xl mx-auto"><span className="text-xs text-app-text-tertiary">{appStep === "processing" ? (err ? "处理出错" : "处理中...") : `${subtitleItems.length} 条字幕`}</span><ExportButton items={subtitleItems} disabled={appStep !== "preview"} videoFileName={videoFile?.name} /></div></div>)}

      {settingsOpen && (<div className="fixed inset-0 z-40" onClick={() => setSettingsOpen(false)}><div className="absolute top-20 right-8 w-80 rounded-2xl bg-app-elevated ring-1 ring-app-border shadow-2xl p-5 z-50" onClick={(e) => e.stopPropagation()}><SettingsPopover sourceLang={sourceLang} targetLang={targetLang} onSourceLangChange={(l) => update({ sourceLang: l })} onTargetLangChange={(l) => update({ targetLang: l })} uploadVideo={uploadVideo} onUploadVideoChange={(v) => update({ uploadVideo: v })} onClose={() => setSettingsOpen(false)} /></div></div>)}
    </div>
  );
}
