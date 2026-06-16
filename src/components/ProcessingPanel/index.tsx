import Icon from "@/components/Icon";
import { AUDIO_STEPS, VIDEO_STEPS } from "@/config";

interface Props {
  progressMessage: string;
  pipelinePhase: string | null;
  subtitleCount: number;
  onCancel: () => void;
  hasError: string | null;
  isVideoMode: boolean;
}

export default function ProcessingPanel({
  progressMessage,
  pipelinePhase,
  subtitleCount,
  onCancel,
  hasError,
  isVideoMode,
}: Props) {
  const steps = isVideoMode ? VIDEO_STEPS : AUDIO_STEPS;

  // Map phase → step index
  let currentStep: number;
  switch (pipelinePhase) {
    case "extracting":
      currentStep = 0;
      break;
    case "uploading":
      currentStep = 1;
      break;
    case "translating":
      currentStep = subtitleCount > 0 ? 3 : 2;
      break;
    default:
      currentStep = steps.length;
      break;
  }

  return (
    <div className="rounded-2xl bg-app-surface-alt ring-1 ring-app-border p-6 space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-app-text-secondary tracking-wide uppercase">
          {isVideoMode ? "视频模式" : "音频模式"} · 处理进度
        </span>
        {pipelinePhase && (
          <button
            onClick={onCancel}
            className="px-2.5 py-1 text-[11px] text-app-error hover:text-app-error bg-app-error-bg hover:bg-app-error-bg rounded-lg transition-all"
          >
            取消
          </button>
        )}
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          const err = !!hasError && active;
          return (
            <div key={step.key} className="flex items-start gap-3">
              <div
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium transition-all duration-500
                ${done ? "bg-app-success-bg text-app-success" : ""}
                ${active && !err ? "bg-app-accent-bg text-app-accent ring-2 ring-app-accent-ring" : ""}
                ${err ? "bg-app-error-bg text-app-error ring-2 ring-app-error-ring" : ""}
                ${!done && !active ? "bg-app-surface text-app-text-tertiary" : ""}`}
              >
                {done ? (
                  <Icon name="check" className="w-3 h-3" />
                ) : err ? (
                  <Icon name="close" className="w-3 h-3" />
                ) : active ? (
                  <Icon name="spinner" className="w-3 h-3 animate-spin" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium transition-colors duration-300 ${done ? "text-app-success" : err ? "text-app-error" : active ? "text-app-text" : "text-app-text-tertiary"}`}
                >
                  {step.label}
                </p>
                <p
                  className={`text-xs mt-0.5 ${err ? "text-app-error" : "text-app-text-tertiary"}`}
                >
                  {active ? progressMessage : step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {pipelinePhase === "translating" && subtitleCount > 0 && (
        <div className="pt-3 border-t border-app-border-light">
          <p className="text-sm text-app-text-secondary">
            已接收 <span className="text-app-accent font-semibold">{subtitleCount}</span> 条字幕
          </p>
        </div>
      )}

      {hasError && (
        <div className="p-3 rounded-xl bg-app-error-bg ring-1 ring-app-error-ring">
          <p className="text-sm text-app-error">{hasError}</p>
        </div>
      )}
    </div>
  );
}
