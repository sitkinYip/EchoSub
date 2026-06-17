import Icon from "@/components/Icon";
import type { PipelineStep } from "@/pages/TranslatePage/utils/pipelineTypes";

type ProcessingStepItemProps = {
  step: PipelineStep;
  index: number;
  isLast: boolean;
};

const statusText: Record<PipelineStep["status"], string> = {
  pending: "等待中",
  active: "进行中",
  done: "已完成",
  error: "出错",
  skipped: "已跳过",
  waiting: "等待选择",
  switched: "已切换",
};

function markerClass(status: PipelineStep["status"]) {
  switch (status) {
    case "done":
      return "bg-app-success-bg text-app-success ring-app-success-ring";
    case "active":
      return "bg-app-accent-bg text-app-accent ring-app-accent-ring";
    case "error":
      return "bg-app-error-bg text-app-error ring-app-error-ring";
    case "waiting":
      return "bg-app-accent-bg text-app-accent ring-app-accent-ring";
    case "switched":
      return "bg-app-surface text-app-text-secondary ring-app-border";
    case "skipped":
      return "bg-app-surface text-app-text-tertiary ring-app-border-light";
    case "pending":
      return "bg-app-surface text-app-text-tertiary ring-app-border-light";
  }
}

function titleClass(status: PipelineStep["status"]) {
  switch (status) {
    case "done":
      return "text-app-success";
    case "error":
      return "text-app-error";
    case "active":
    case "waiting":
      return "text-app-text";
    case "switched":
    case "skipped":
    case "pending":
      return "text-app-text-secondary";
  }
}

function detailClass(status: PipelineStep["status"]) {
  if (status === "error") return "text-app-error";
  if (status === "active" || status === "waiting") return "text-app-text-secondary";
  return "text-app-text-tertiary";
}

function StepMarker({ step, index }: { step: PipelineStep; index: number }) {
  const className = `flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ring-1 transition-colors ${markerClass(
    step.status,
  )}`;

  if (step.status === "done") {
    return (
      <div className={className}>
        <Icon name="check" className="h-3.5 w-3.5" />
      </div>
    );
  }

  if (step.status === "active") {
    return (
      <div className={className}>
        <Icon name="spinner" className="h-3.5 w-3.5 animate-spin" />
      </div>
    );
  }

  if (step.status === "error") {
    return (
      <div className={className}>
        <Icon name="close" className="h-3.5 w-3.5" />
      </div>
    );
  }

  if (step.status === "waiting") {
    return (
      <div className={className}>
        <Icon name="help" className="h-3.5 w-3.5" />
      </div>
    );
  }

  if (step.status === "switched" || step.status === "skipped") {
    return <div className={className}>-</div>;
  }

  return <div className={className}>{index + 1}</div>;
}

export default function ProcessingStepItem({ step, index, isLast }: ProcessingStepItemProps) {
  const detail = step.error || step.detail || step.description;

  return (
    <li className="relative grid grid-cols-[28px_1fr] gap-3">
      {!isLast && (
        <div className="absolute left-[13px] top-8 h-[calc(100%-1.5rem)] w-px bg-app-border-light" />
      )}
      <StepMarker step={step} index={index} />
      <div className="min-w-0 pb-4">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <p className={`truncate text-sm font-medium ${titleClass(step.status)}`}>{step.label}</p>
          <span className="flex-shrink-0 text-[11px] text-app-text-tertiary">
            {statusText[step.status]}
          </span>
        </div>
        <p className={`mt-1 text-xs leading-relaxed ${detailClass(step.status)}`}>{detail}</p>
      </div>
    </li>
  );
}
