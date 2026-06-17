import DropZone from "@/components/DropZone";
import FilePill from "@/components/FilePill";
import Icon from "@/components/Icon";
import ProcessingPanel from "@/components/ProcessingPanel";
import SubtitlePreview from "@/components/SubtitlePreview";
import ProcessingLiveOutput from "./processing/ProcessingLiveOutput";
import type { PipelinePhase } from "@/stores/translationStore";
import type { SubtitleItem, VideoFile } from "@/types";
import type {
  PipelineRoute,
  PipelineStep,
  PipelineStepKey,
} from "@/pages/TranslatePage/utils/pipelineTypes";

type TranslateContentProps = {
  appStep: "idle" | "processing" | "preview";
  pipelinePhase: PipelinePhase | null;
  pipelineRoute: PipelineRoute | null;
  pipelineSteps: PipelineStep[];
  activeStepKey: PipelineStepKey | null;
  videoFile: VideoFile | null;
  progress: string;
  error: string | null;
  subtitleCount: number;
  rawPreviewText: string;
  subtitleItems: SubtitleItem[];
  sourceLang: string;
  targetLang: string;
  modeLabel: string;
  uploadVideo: boolean;
  onFile: (path: string, name: string) => void;
  onReset: () => void;
  onUpdateSubtitleText: (index: number, text: string) => void;
};

export default function TranslateContent({
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
  sourceLang,
  targetLang,
  modeLabel,
  uploadVideo,
  onFile,
  onReset,
  onUpdateSubtitleText,
}: TranslateContentProps) {
  return (
    <div className="mt-8 min-h-0 flex-1 overflow-y-auto px-8">
      <div className={`mx-auto pb-24 ${appStep === "processing" ? "max-w-4xl" : "max-w-3xl"}`}>
        {appStep === "idle" && (
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="w-full max-w-2xl">
              <DropZone onFileSelect={onFile} />
            </div>
          </div>
        )}

        {appStep === "processing" && (
          <div className="flex min-h-0 flex-col gap-5">
            {videoFile && (
              <div className="flex-shrink-0">
                <FilePill
                  name={videoFile.name}
                  sourceLang={sourceLang}
                  targetLang={targetLang}
                  mode={modeLabel}
                  onReset={onReset}
                />
              </div>
            )}
            <div className="flex-shrink-0">
              <ProcessingPanel
                progressMessage={progress || (error ? "处理出错" : "")}
                pipelinePhase={pipelinePhase}
                pipelineRoute={pipelineRoute}
                pipelineSteps={pipelineSteps}
                activeStepKey={activeStepKey}
                subtitleCount={subtitleCount}
                onCancel={onReset}
                hasError={error}
                isVideoMode={uploadVideo}
              />
            </div>

            {(rawPreviewText || subtitleItems.length > 0) && (
              <div className="grid min-h-0 gap-5">
                {rawPreviewText && <ProcessingLiveOutput text={rawPreviewText} />}
                {subtitleItems.length > 0 && (
                  <SubtitlePreview items={subtitleItems} onUpdateText={onUpdateSubtitleText} />
                )}
              </div>
            )}
          </div>
        )}

        {appStep === "preview" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-app-success-bg ring-1 ring-app-success-ring">
              <div className="w-8 h-8 rounded-full bg-app-success-bg flex items-center justify-center">
                <Icon name="check" className="w-4 h-4 text-app-success" />
              </div>
              <span className="text-sm text-app-success flex-1">{videoFile?.name} 翻译完成</span>
              <button
                onClick={onReset}
                className="px-3 py-1.5 text-[11px] text-app-text-secondary hover:text-app-text bg-app-surface hover:bg-app-hover rounded-lg transition-all duration-200"
              >
                处理新视频
              </button>
            </div>
            <SubtitlePreview items={subtitleItems} onUpdateText={onUpdateSubtitleText} />
          </div>
        )}
      </div>
    </div>
  );
}
