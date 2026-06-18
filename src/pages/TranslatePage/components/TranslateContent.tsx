import { useRef } from "react";
import DropZone from "@/components/DropZone";
import ProcessingPanel from "@/components/ProcessingPanel";
import SubtitlePreview from "@/components/SubtitlePreview";
import ProcessingFileBanner from "./processing/ProcessingFileBanner";
import ProcessingLiveOutput from "./processing/ProcessingLiveOutput";
import usePipelineAutoScroll from "./processing/usePipelineAutoScroll";
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
  const processingScrollRef = useRef<HTMLDivElement>(null);
  const processingUpdateKey = [
    ...pipelineSteps.map((step) =>
      [step.key, step.status, step.detail || "", step.error || ""].join(":"),
    ),
    error || "",
    rawPreviewText,
    subtitleItems.length,
    subtitleItems[subtitleItems.length - 1]?.text || "",
  ].join("|");

  usePipelineAutoScroll(processingScrollRef, processingUpdateKey);

  return (
    <div
      className={`mt-8 min-h-0 flex-1 px-8 ${
        appStep === "idle" ? "overflow-y-auto" : "overflow-hidden"
      }`}
    >
      <div
        className={`mx-auto h-full ${
          appStep === "processing"
            ? "max-w-4xl"
            : appStep === "preview"
              ? "max-w-3xl"
              : "max-w-3xl pb-24"
        }`}
      >
        {appStep === "idle" && (
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="w-full max-w-2xl">
              <DropZone onFileSelect={onFile} />
            </div>
          </div>
        )}

        {appStep === "processing" && (
          <div className="flex h-full min-h-0 flex-col gap-5">
            {videoFile && (
              <div className="flex-shrink-0">
                <ProcessingFileBanner
                  name={videoFile.name}
                  sourceLang={sourceLang}
                  targetLang={targetLang}
                  mode={modeLabel}
                  steps={pipelineSteps}
                  progressMessage={progress}
                  error={error}
                  onReset={onReset}
                />
              </div>
            )}

            <div
              ref={processingScrollRef}
              className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5"
            >
              <div className="grid gap-5">
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

                {(rawPreviewText || subtitleItems.length > 0) && (
                  <>
                    {rawPreviewText && (
                      <ProcessingLiveOutput text={rawPreviewText} contained={false} />
                    )}
                    {subtitleItems.length > 0 && (
                      <SubtitlePreview
                        items={subtitleItems}
                        onUpdateText={onUpdateSubtitleText}
                        contained={false}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {appStep === "preview" && (
          <div className="flex h-full min-h-0 flex-col gap-6">
            {videoFile && (
              <div className="flex-shrink-0">
                <ProcessingFileBanner
                  name={videoFile.name}
                  sourceLang={sourceLang}
                  targetLang={targetLang}
                  mode={modeLabel}
                  steps={pipelineSteps}
                  progressMessage=""
                  error={null}
                  complete
                  onReset={onReset}
                />
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5 pr-1">
              <SubtitlePreview
                items={subtitleItems}
                onUpdateText={onUpdateSubtitleText}
                contained={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
