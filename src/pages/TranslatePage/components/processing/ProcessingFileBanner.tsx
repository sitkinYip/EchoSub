import FilePill from "@/components/FilePill";
import type { PipelineStep } from "@/pages/TranslatePage/utils/pipelineTypes";

type ProcessingFileBannerProps = {
  name: string;
  sourceLang: string;
  targetLang: string;
  mode: string;
  steps: PipelineStep[];
  progressMessage: string;
  error: string | null;
  complete?: boolean;
  onReset: () => void;
};

const completedStatuses = new Set<PipelineStep["status"]>(["done", "skipped", "switched"]);

export function getProcessingBannerStatus(
  steps: PipelineStep[],
  progressMessage: string,
  error: string | null,
  complete = false,
) {
  if (complete) {
    return {
      label: "已完成",
      progressPercent: 100,
      tone: "complete" as const,
    };
  }

  const completeCount = steps.filter((step) => completedStatuses.has(step.status)).length;
  const progressPercent = steps.length > 0 ? Math.round((completeCount / steps.length) * 100) : 0;
  const errorStep = steps.find((step) => step.status === "error");
  const currentStep = steps.find((step) => step.status === "active" || step.status === "waiting");

  if (error) {
    return {
      label: errorStep ? `${errorStep.label}失败` : "处理失败",
      count: `${completeCount}/${steps.length}`,
      progressPercent,
      tone: "error" as const,
    };
  }

  return {
    label: progressMessage || currentStep?.detail || currentStep?.label || "正在准备处理",
    count: `${completeCount}/${steps.length}`,
    progressPercent,
    tone: "active" as const,
  };
}

export default function ProcessingFileBanner({
  name,
  sourceLang,
  targetLang,
  mode,
  steps,
  progressMessage,
  error,
  complete = false,
  onReset,
}: ProcessingFileBannerProps) {
  return (
    <FilePill
      name={name}
      sourceLang={sourceLang}
      targetLang={targetLang}
      mode={mode}
      onReset={onReset}
      status={getProcessingBannerStatus(steps, progressMessage, error, complete)}
    />
  );
}
