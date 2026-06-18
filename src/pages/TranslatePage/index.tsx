import SettingsOverlay from "./components/SettingsOverlay";
import TranslateContent from "./components/TranslateContent";
import TranslateFooter from "./components/TranslateFooter";
import TranslateHeader from "./components/TranslateHeader";
import { useTranslatePageController } from "./hooks/useTranslatePageController";

export default function TranslatePage() {
  const { settings, translation, settingsOpen, modeLabel, onFile, onSettingsOpenChange } =
    useTranslatePageController();
  const {
    apiKey,
    hasApiKey,
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
  } = settings;
  const {
    appStep,
    pipelinePhase,
    pipelineRoute,
    pipelineSteps,
    activeStepKey,
    videoFile,
    progress,
    error,
    subtitleCount,
    rawPreviewText,
    subtitleItems,
    reset,
    updateSubtitleText,
  } = translation;

  return (
    <div className="flex flex-col h-full">
      <TranslateHeader
        sourceLang={sourceLang}
        targetLang={targetLang}
        uploadVideo={uploadVideo}
        showUploadStrategy={engine === "cloud" && appStep === "idle"}
        hasApiKey={hasApiKey}
        showReset={appStep !== "idle"}
        onUpdate={update}
        onSettingsClick={() => onSettingsOpenChange(!settingsOpen)}
        onReset={reset}
      />

      <TranslateContent
        appStep={appStep}
        pipelinePhase={pipelinePhase}
        pipelineRoute={pipelineRoute}
        pipelineSteps={pipelineSteps}
        activeStepKey={activeStepKey}
        videoFile={videoFile}
        progress={progress}
        error={error}
        subtitleCount={subtitleCount}
        rawPreviewText={rawPreviewText}
        subtitleItems={subtitleItems}
        sourceLang={sourceLang}
        targetLang={targetLang}
        modeLabel={modeLabel}
        uploadVideo={uploadVideo}
        onFile={onFile}
        onReset={reset}
        onUpdateSubtitleText={updateSubtitleText}
      />

      {appStep !== "idle" && (
        <TranslateFooter
          appStep={appStep}
          error={error}
          subtitleItems={subtitleItems}
          videoFileName={videoFile?.name}
        />
      )}

      {settingsOpen && (
        <SettingsOverlay
          sourceLang={sourceLang}
          targetLang={targetLang}
          apiKey={apiKey}
          engine={engine}
          translationFallback={translationFallback}
          whisperModelId={whisperModelId}
          whisperModelPath={whisperModelPath}
          translateModelId={translateModelId}
          translateModelPath={translateModelPath}
          onUpdate={update}
          onClose={() => onSettingsOpenChange(false)}
        />
      )}
    </div>
  );
}
