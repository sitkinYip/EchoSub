import { describe, expect, it } from "vitest";
import { createPipelineStepsForInput, getPipelineStepKeys } from "./pipelineSteps";

describe("pipelineSteps", () => {
  it("builds cloud media routes with media upload steps", () => {
    expect(
      createPipelineStepsForInput({
        engine: "cloud",
        mode: "audio",
        sourceLang: "日语",
        targetLang: "中文",
        translationFallback: "cloud-then-local",
      }),
    ).toMatchObject({
      route: "cloud-audio",
      steps: [
        { key: "analyze-file" },
        { key: "prepare-audio" },
        { key: "upload-media" },
        { key: "cloud-media-translate" },
        { key: "parse-subtitles" },
        { key: "save-history" },
      ],
    });

    expect(getPipelineStepKeys("cloud-video")).toContain("process-media");
    expect(getPipelineStepKeys("cloud-video")).toContain("upload-media");
  });

  it("builds local same-language route without translation steps", () => {
    const { route, steps } = createPipelineStepsForInput({
      engine: "local",
      mode: "audio",
      sourceLang: "日语",
      targetLang: "日语",
      translationFallback: "cloud-then-local",
    });

    const keys = steps.map((step) => step.key);
    expect(route).toBe("local-same-language");
    expect(keys).toEqual([
      "analyze-file",
      "prepare-local-audio",
      "local-whisper",
      "parse-subtitles",
      "save-history",
    ]);
    expect(keys).not.toContain("cloud-text-translate");
    expect(keys).not.toContain("local-llm-translate");
  });

  it("separates local cross-language fallback routes", () => {
    expect(
      createPipelineStepsForInput({
        engine: "local",
        mode: "audio",
        sourceLang: "日语",
        targetLang: "中文",
        translationFallback: "cloud-only",
      }).route,
    ).toBe("local-cloud-text");

    expect(
      createPipelineStepsForInput({
        engine: "local",
        mode: "audio",
        sourceLang: "日语",
        targetLang: "中文",
        translationFallback: "local-only",
      }).route,
    ).toBe("local-local-text");

    expect(getPipelineStepKeys("local-cloud-then-local-text")).toEqual([
      "analyze-file",
      "prepare-local-audio",
      "local-whisper",
      "cloud-text-translate",
      "local-llm-start",
      "local-llm-translate",
      "parse-subtitles",
      "save-history",
    ]);
  });
});
