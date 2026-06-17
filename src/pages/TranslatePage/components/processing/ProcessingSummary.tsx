import type { PipelineRoute, PipelineStep } from "@/pages/TranslatePage/utils/pipelineTypes";
import {
  PIPELINE_ROUTE_DESCRIPTIONS,
  PIPELINE_ROUTE_LABELS,
} from "@/pages/TranslatePage/utils/pipelineStepLabels";

type ProcessingSummaryProps = {
  route: PipelineRoute | null;
  legacyModeLabel: string;
  steps: PipelineStep[];
  subtitleCount: number;
};

export default function ProcessingSummary({
  route,
  legacyModeLabel,
  steps,
  subtitleCount,
}: ProcessingSummaryProps) {
  const activeStep = steps.find((step) => step.status === "active" || step.status === "waiting");
  const completeCount = steps.filter(
    (step) => step.status === "done" || step.status === "skipped" || step.status === "switched",
  ).length;
  const progressPercent = steps.length > 0 ? Math.round((completeCount / steps.length) * 100) : 0;
  const label = route ? PIPELINE_ROUTE_LABELS[route] : legacyModeLabel;
  const description = route ? PIPELINE_ROUTE_DESCRIPTIONS[route] : "正在处理媒体并生成字幕。";

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-app-text-tertiary">处理进度</p>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-app-text">{label}</h2>
            <p className="mt-1 text-xs leading-relaxed text-app-text-secondary">{description}</p>
          </div>
          <div className="flex-shrink-0 rounded-full bg-app-surface px-2.5 py-1 text-[11px] text-app-text-secondary ring-1 ring-app-border">
            {completeCount}/{steps.length}
          </div>
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-app-surface ring-1 ring-app-border-light">
        <div
          className="h-full rounded-full bg-app-accent transition-[width] duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {(activeStep || subtitleCount > 0) && (
        <div className="grid gap-2 rounded-xl bg-app-surface px-4 py-3 ring-1 ring-app-border-light sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[11px] text-app-text-tertiary">当前步骤</p>
            <p className="mt-0.5 truncate text-sm text-app-text">
              {activeStep?.label || "等待结果"}
            </p>
          </div>
          <div className="min-w-0 sm:text-right">
            <p className="text-[11px] text-app-text-tertiary">字幕接收</p>
            <p className="mt-0.5 text-sm text-app-text">
              <span className="font-semibold text-app-accent">{subtitleCount}</span> 条
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
