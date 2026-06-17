import type { TranslationActions } from "@/stores/translationStore";
import type { PipelineStepKey } from "@/pages/TranslatePage/utils/pipelineTypes";

export type PipelineStepAction =
  | {
      type: "activate" | "complete" | "skip" | "wait" | "switch";
      key: PipelineStepKey;
      detail?: string;
    }
  | {
      type: "fail";
      key: PipelineStepKey;
      error: string;
      detail?: string;
    };

export type PipelineStepActionTarget = Pick<
  TranslationActions,
  | "activatePipelineStep"
  | "completePipelineStep"
  | "failPipelineStep"
  | "skipPipelineStep"
  | "waitPipelineStep"
  | "switchPipelineStep"
>;

export function activateStep(key: PipelineStepKey, detail?: string): PipelineStepAction {
  return { type: "activate", key, detail };
}

export function completeStep(key: PipelineStepKey, detail?: string): PipelineStepAction {
  return { type: "complete", key, detail };
}

export function failStep(key: PipelineStepKey, error: string, detail?: string): PipelineStepAction {
  return { type: "fail", key, error, detail };
}

export function skipStep(key: PipelineStepKey, detail?: string): PipelineStepAction {
  return { type: "skip", key, detail };
}

export function waitStep(key: PipelineStepKey, detail?: string): PipelineStepAction {
  return { type: "wait", key, detail };
}

export function switchStep(key: PipelineStepKey, detail?: string): PipelineStepAction {
  return { type: "switch", key, detail };
}

export function applyPipelineStepAction(
  target: PipelineStepActionTarget,
  action: PipelineStepAction,
) {
  switch (action.type) {
    case "activate":
      target.activatePipelineStep(action.key, action.detail);
      break;
    case "complete":
      target.completePipelineStep(action.key, action.detail);
      break;
    case "fail":
      target.failPipelineStep(action.key, action.error, action.detail);
      break;
    case "skip":
      target.skipPipelineStep(action.key, action.detail);
      break;
    case "wait":
      target.waitPipelineStep(action.key, action.detail);
      break;
    case "switch":
      target.switchPipelineStep(action.key, action.detail);
      break;
  }
}

export function applyPipelineStepActions(
  target: PipelineStepActionTarget,
  actions: PipelineStepAction[],
) {
  actions.forEach((action) => applyPipelineStepAction(target, action));
}
