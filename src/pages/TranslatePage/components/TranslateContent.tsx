import DropZone from "@/components/DropZone";
import FilePill from "@/components/FilePill";
import Icon from "@/components/Icon";
import ProcessingPanel from "@/components/ProcessingPanel";
import SubtitlePreview from "@/components/SubtitlePreview";
import type { PipelinePhase } from "@/stores/translationStore";
import type { SubtitleItem, VideoFile } from "@/types";

type TranslateContentProps = {
  appStep: "idle" | "processing" | "preview";
  pipelinePhase: PipelinePhase | null;
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
                onReset={onReset}
              />
            )}
            <ProcessingPanel
              progressMessage={progress || (error ? "处理出错" : "")}
              pipelinePhase={pipelinePhase}
              subtitleCount={subtitleCount}
              onCancel={onReset}
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
              <SubtitlePreview items={subtitleItems} onUpdateText={onUpdateSubtitleText} />
            )}
          </div>
        )}

        {appStep === "preview" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-app-success-bg ring-1 ring-app-success-ring">
              <div className="w-8 h-8 rounded-full bg-app-success-bg flex items-center justify-center">
                <Icon name="check" className="w-4 h-4 text-app-success" />
              </div>
              <span className="text-sm text-app-success flex-1">{videoFile?.name} — 翻译完成</span>
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
