import type {
  PipelineRoute,
  PipelineRouteInput,
  PipelineStep,
  PipelineStepKey,
} from "./pipelineTypes";
import { PIPELINE_STEP_COPY } from "./pipelineStepLabels";

const PIPELINE_ROUTE_STEPS = {
  "cloud-audio": [
    "analyze-file",
    "prepare-audio",
    "upload-media",
    "cloud-media-translate",
    "parse-subtitles",
    "save-history",
  ],
  "cloud-video": [
    "analyze-file",
    "process-media",
    "upload-media",
    "cloud-media-translate",
    "parse-subtitles",
    "save-history",
  ],
  "local-same-language": [
    "analyze-file",
    "prepare-local-audio",
    "local-whisper",
    "parse-subtitles",
    "save-history",
  ],
  "local-cloud-text": [
    "analyze-file",
    "prepare-local-audio",
    "local-whisper",
    "cloud-text-translate",
    "parse-subtitles",
    "save-history",
  ],
  "local-local-text": [
    "analyze-file",
    "prepare-local-audio",
    "local-whisper",
    "local-llm-start",
    "local-llm-translate",
    "parse-subtitles",
    "save-history",
  ],
  "local-cloud-then-local-text": [
    "analyze-file",
    "prepare-local-audio",
    "local-whisper",
    "cloud-text-translate",
    "local-llm-start",
    "local-llm-translate",
    "parse-subtitles",
    "save-history",
  ],
} satisfies Record<PipelineRoute, PipelineStepKey[]>;

export function resolvePipelineRoute(input: PipelineRouteInput): PipelineRoute {
  if (input.engine === "cloud") {
    return input.mode === "video" ? "cloud-video" : "cloud-audio";
  }

  if (input.sourceLang === input.targetLang) {
    return "local-same-language";
  }

  if (input.translationFallback === "cloud-only") {
    return "local-cloud-text";
  }

  if (input.translationFallback === "local-only") {
    return "local-local-text";
  }

  return "local-cloud-then-local-text";
}

export function getPipelineStepKeys(route: PipelineRoute): PipelineStepKey[] {
  return [...PIPELINE_ROUTE_STEPS[route]];
}

export function createPipelineStep(key: PipelineStepKey): PipelineStep {
  const copy = PIPELINE_STEP_COPY[key];
  return {
    key,
    label: copy.label,
    description: copy.description,
    status: "pending",
  };
}

export function createPipelineSteps(route: PipelineRoute): PipelineStep[] {
  return getPipelineStepKeys(route).map(createPipelineStep);
}

export function createPipelineStepsForInput(input: PipelineRouteInput): {
  route: PipelineRoute;
  steps: PipelineStep[];
} {
  const route = resolvePipelineRoute(input);
  return {
    route,
    steps: createPipelineSteps(route),
  };
}
