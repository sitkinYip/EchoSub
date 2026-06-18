import { AUDIO_STEPS, VIDEO_STEPS } from "@/config";
import type { PipelineRoute, PipelineStep } from "@/pages/TranslatePage/utils/pipelineTypes";
import ProcessingErrorCard from "./ProcessingErrorCard";
import ProcessingStepList from "./ProcessingStepList";

export type ProcessingPanelProps = {
  progressMessage: string;
  pipelinePhase: string | null;
  subtitleCount: number;
  onCancel: () => void;
  hasError: string | null;
  isVideoMode: boolean;
  pipelineRoute?: PipelineRoute | null;
  pipelineSteps?: PipelineStep[];
  activeStepKey?: string | null;
};

function legacySteps(props: ProcessingPanelProps): PipelineStep[] {
  const source = props.isVideoMode ? VIDEO_STEPS : AUDIO_STEPS;
  let currentStep: number;

  switch (props.pipelinePhase) {
    case "extracting":
      currentStep = 0;
      break;
    case "uploading":
      currentStep = 1;
      break;
    case "translating":
      currentStep = props.subtitleCount > 0 ? 3 : 2;
      break;
    default:
      currentStep = props.hasError ? 0 : source.length;
      break;
  }

  return source.map((step, index) => {
    const isActive = index === currentStep && !!props.pipelinePhase;
    const isError = !!props.hasError && isActive;
    return {
      key: step.key as PipelineStep["key"],
      label: step.label,
      description: step.description,
      status: isError ? "error" : isActive ? "active" : index < currentStep ? "done" : "pending",
      detail: isActive ? props.progressMessage : undefined,
      error: isError ? props.hasError || undefined : undefined,
    };
  });
}

export default function ProcessingPanel(props: ProcessingPanelProps) {
  const steps = props.pipelineSteps?.length ? props.pipelineSteps : legacySteps(props);
  const canCancel = props.pipelinePhase !== null;

  return (
    <section className="rounded-2xl bg-app-surface-alt ring-1 ring-app-border">
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex min-h-7 items-center justify-between gap-4">
          <h2 className="text-xs font-medium text-app-text-tertiary">流程详情</h2>
          {canCancel && (
            <button
              onClick={props.onCancel}
              className="flex-shrink-0 rounded-lg bg-app-error-bg px-3 py-1.5 text-xs font-medium text-app-error ring-1 ring-app-error-ring transition-colors hover:bg-app-error-bg"
            >
              取消
            </button>
          )}
        </div>

        <ProcessingStepList steps={steps} />

        {props.hasError && <ProcessingErrorCard message={props.hasError} />}
      </div>
    </section>
  );
}
