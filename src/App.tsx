import React, { useState, useEffect, useCallback, useRef } from "react";
import { Store } from "@tauri-apps/plugin-store";
import Header from "./components/Header";
import SettingsModal from "./components/SettingsModal";
import DropZone from "./components/DropZone";
import ProcessingPanel from "./components/ProcessingPanel";
import SubtitlePreview from "./components/SubtitlePreview";
import ExportButton from "./components/ExportButton";
import { useAudioExtraction } from "./hooks/useAudioExtraction";
import { useTranslation } from "./hooks/useTranslation";
import type { VideoFile, Language } from "./types";

type AppStep = "idle" | "processing" | "preview";

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState("");
  const [sourceLang, setSourceLang] = useState<Language>("日语");
  const [targetLang, setTargetLang] = useState<Language>("中文");
  const [uploadVideo, setUploadVideo] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appStep, setAppStep] = useState<AppStep>("idle");
  const [videoFile, setVideoFile] = useState<VideoFile | null>(null);

  // 用 ref 避免 useEffect 闭包过期（翻译启动时读取最新值）
  const settingsRef = useRef({ sourceLang, targetLang, uploadVideo });
  settingsRef.current = { sourceLang, targetLang, uploadVideo };

  const {
    extractAudio,
    progress: extractProgress,
    isExtracting,
    lastError: extractionError,
  } = useAudioExtraction();
  const {
    subtitleItems,
    rawPreviewText,
    isTranslating,
    translationError,
    progressMessage: translationProgress,
    startTranslation,
    cancelTranslation,
    updateSubtitleText,
    resetTranslation,
  } = useTranslation();

  // 暂存提取结果（文件路径 + 模式）
  const mediaRef = useRef<{ filePath: string; mediaType: "audio" | "video" } | null>(null);
  const hasStartedRef = useRef(false);
  const pendingVideoRef = useRef<VideoFile | null>(null);

  const displayError = extractionError || translationError;

  // ---- 初始化: 加载已保存的设置 ----
  useEffect(() => {
    (async () => {
      try {
        const store = await Store.load("config.json");
        const savedKey = await store.get<string>("apiKey");
        if (savedKey) setApiKey(savedKey);
        const savedSrc = await store.get<string>("sourceLang");
        if (savedSrc) setSourceLang(savedSrc as Language);
        const savedTgt = await store.get<string>("targetLang");
        if (savedTgt) setTargetLang(savedTgt as Language);
        const savedUpload = await store.get<boolean>("uploadVideo");
        if (savedUpload !== null && savedUpload !== undefined) setUploadVideo(savedUpload);
      } catch (err) {
        console.warn("无法加载配置:", err);
      }
    })();
  }, []);

  // ---- 核心: 启动提取 ----
  const startProcessing = useCallback(
    async (filePath: string, fileName: string) => {
      resetTranslation();
      mediaRef.current = null;
      hasStartedRef.current = false;
      setAppStep("processing");
      setVideoFile({ name: fileName, path: filePath });

      const mode = settingsRef.current.uploadVideo ? "video" : "audio";
      const result = await extractAudio(filePath, mode);
      if (result) {
        mediaRef.current = result;
      }
    },
    [extractAudio, resetTranslation]
  );

  // ---- 当 apiKey 就绪 + 有暂存视频时，自动启动 ----
  useEffect(() => {
    const pending = pendingVideoRef.current;
    if (pending && apiKey && appStep === "idle") {
      pendingVideoRef.current = null;
      startProcessing(pending.path, pending.name);
    }
  }, [apiKey, appStep, startProcessing]);

  // ---- 当提取完成 + apiKey 就绪时，启动翻译 ----
  useEffect(() => {
    if (
      !isExtracting &&
      mediaRef.current &&
      apiKey &&
      !hasStartedRef.current
    ) {
      hasStartedRef.current = true;
      const { filePath, mediaType } = mediaRef.current;
      const { sourceLang: src, targetLang: tgt } = settingsRef.current;
      startTranslation(apiKey, filePath, mediaType, src, tgt);
    }
  }, [isExtracting, apiKey, startTranslation]);

  // ---- 翻译完成后切换到预览 ----
  useEffect(() => {
    if (!isTranslating && hasStartedRef.current && subtitleItems.length > 0) {
      setAppStep("preview");
    }
  }, [isTranslating, subtitleItems]);

  // ---- 用户选择/拖入视频 ----
  const handleFileSelect = useCallback(
    (filePath: string, fileName: string) => {
      if (!apiKey) {
        pendingVideoRef.current = { name: fileName, path: filePath };
        setVideoFile({ name: fileName, path: filePath });
        setSettingsOpen(true);
        return;
      }
      pendingVideoRef.current = null;
      startProcessing(filePath, fileName);
    },
    [apiKey, startProcessing]
  );

  // ---- 设置弹窗：保存 ----
  const handleSettingsSaved = useCallback(
    (newKey: string, newSource: Language, newTarget: Language, newUploadVideo: boolean) => {
      setApiKey(newKey);
      setSourceLang(newSource);
      setTargetLang(newTarget);
      setUploadVideo(newUploadVideo);
      setSettingsOpen(false);
    },
    []
  );

  // ---- 设置弹窗：关闭/取消 ----
  const handleSettingsClose = useCallback(() => {
    setSettingsOpen(false);
    if (!apiKey && appStep === "idle" && pendingVideoRef.current) {
      pendingVideoRef.current = null;
      setVideoFile(null);
    }
  }, [apiKey, appStep]);

  const handleReset = useCallback(() => {
    cancelTranslation();
    resetTranslation();
    mediaRef.current = null;
    hasStartedRef.current = false;
    pendingVideoRef.current = null;
    setVideoFile(null);
    setAppStep("idle");
  }, [cancelTranslation, resetTranslation]);

  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);

  const handleSourceLangChange = useCallback(async (lang: Language) => {
    setSourceLang(lang);
    try {
      const store = await Store.load("config.json");
      await store.set("sourceLang", lang);
      await store.save();
    } catch {}
  }, []);

  const handleTargetLangChange = useCallback(async (lang: Language) => {
    setTargetLang(lang);
    try {
      const store = await Store.load("config.json");
      await store.set("targetLang", lang);
      await store.save();
    } catch {}
  }, []);

  const mode = uploadVideo ? "视频" : "音频";
  const currentProgressMessage = isTranslating
    ? translationProgress
      || (rawPreviewText.length > 0
        ? `翻译中... 已收到 ${rawPreviewText.length} 字符`
        : "正在等待 AI 首次响应...")
    : extractProgress
      || (displayError ? "处理出错" : "");

  return (
    <div className="flex flex-col h-screen max-h-screen">
      <Header
            hasApiKey={!!apiKey}
            onOpenSettings={handleOpenSettings}
            sourceLang={sourceLang}
            targetLang={targetLang}
            onSourceLangChange={handleSourceLangChange}
            onTargetLangChange={handleTargetLangChange}
          />

      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {appStep === "idle" && <DropZone onFileSelect={handleFileSelect} />}

          {appStep === "processing" && (
            <div className="space-y-4">
              {videoFile && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-900/50 border border-gray-800">
                  <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm text-gray-300 truncate flex-1">{videoFile.name}</span>
                  <span className="text-xs text-gray-500">{sourceLang} → {targetLang} · {mode}</span>
                  <button onClick={handleReset} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">重新选择</button>
                </div>
              )}

              <ProcessingPanel
                progressMessage={currentProgressMessage}
                isExtracting={isExtracting}
                isTranslating={isTranslating}
                subtitleCount={subtitleItems.length}
                onCancel={handleReset}
                hasError={displayError}
                isVideoMode={uploadVideo}
              />

              {isTranslating && rawPreviewText && !subtitleItems.length && (
                <div className="rounded-2xl border border-gray-800 bg-gray-900/30 p-4 max-h-[400px] overflow-y-auto">
                  <p className="text-xs text-gray-500 mb-2">实时字幕流（翻译完成后将解析为标准格式）</p>
                  <pre className="text-sm text-gray-300 font-sans whitespace-pre-wrap break-words leading-relaxed">{rawPreviewText}</pre>
                </div>
              )}

              {subtitleItems.length > 0 && (
                <SubtitlePreview items={subtitleItems} onUpdateText={updateSubtitleText} />
              )}
            </div>
          )}

          {appStep === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20">
                <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-green-300 flex-1">
                  {videoFile?.name} — {sourceLang} → {targetLang} 翻译完成！双击修改错别字后导出 SRT。
                </span>
                <button onClick={handleReset} className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">处理新视频</button>
              </div>
              <SubtitlePreview items={subtitleItems} onUpdateText={updateSubtitleText} />
            </div>
          )}
        </div>
      </main>

      <footer className="flex items-center justify-between px-6 py-3 border-t border-gray-800 bg-gray-900/50">
        <span className="text-xs text-gray-600">
          {appStep === "idle" && "拖拽或选择视频文件开始"}
          {appStep === "processing" && (displayError ? "处理出错" : "处理中，请稍候...")}
          {appStep === "preview" && `${subtitleItems.length} 条字幕 · 确认无误后导出`}
        </span>
        <div className="flex items-center gap-3">
          {apiKey && (
            <span className="text-xs text-gray-600 hidden sm:inline">
              {sourceLang} → {targetLang} · {uploadVideo ? "视频" : "音频"}
            </span>
          )}
          {appStep !== "idle" && <ExportButton items={subtitleItems} disabled={appStep !== "preview"} videoFileName={videoFile?.name} />}
        </div>
      </footer>

      <SettingsModal
        open={settingsOpen}
        onClose={handleSettingsClose}
        onSaved={handleSettingsSaved}
        currentKey={apiKey}
        currentSourceLang={sourceLang}
        currentTargetLang={targetLang}
        currentUploadVideo={uploadVideo}
      />
    </div>
  );
};

export default App;
