import type { PipelineStep } from "@/pages/TranslatePage/utils/pipelineTypes";
import ProcessingStepItem from "./ProcessingStepItem";

type ProcessingStepListProps = {
  steps: PipelineStep[];
};

export default function ProcessingStepList({ steps }: ProcessingStepListProps) {
  return (
    <ol className="space-y-0">
      {steps.map((step, index) => (
        <ProcessingStepItem
          key={step.key}
          step={step}
          index={index}
          isLast={index === steps.length - 1}
        />
      ))}
    </ol>
  );
}
