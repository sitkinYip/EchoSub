import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/translateService", () => ({
  startPipeline: vi.fn(),
  resetPipeline: vi.fn(),
  cancelPipeline: vi.fn(),
}));

describe("translationStore pipeline steps", () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it("initializes route-specific steps and updates individual step states", async () => {
    const { useTranslationStore } = await import("./translationStore");
    const store = useTranslationStore.getState();

    store.initPipelineSteps({
      engine: "local",
      mode: "audio",
      sourceLang: "日语",
      targetLang: "中文",
      translationFallback: "cloud-then-local",
    });

    expect(useTranslationStore.getState().pipelineRoute).toBe("local-cloud-then-local-text");
    expect(useTranslationStore.getState().pipelineSteps.map((step) => step.key)).toContain(
      "cloud-text-translate",
    );

    useTranslationStore.getState().activatePipelineStep("local-whisper", "识别中 42%");
    expect(useTranslationStore.getState().activeStepKey).toBe("local-whisper");
    expect(
      useTranslationStore.getState().pipelineSteps.find((s) => s.key === "local-whisper"),
    ).toMatchObject({
      status: "active",
      detail: "识别中 42%",
      error: "",
    });

    useTranslationStore.getState().switchPipelineStep("cloud-text-translate", "已切换到本地");
    expect(
      useTranslationStore.getState().pipelineSteps.find((s) => s.key === "cloud-text-translate"),
    ).toMatchObject({
      status: "switched",
      detail: "已切换到本地",
    });

    useTranslationStore.getState().failPipelineStep("local-llm-translate", "本地 LLM 请求失败");
    expect(useTranslationStore.getState().activeStepKey).toBe("local-llm-translate");
    expect(
      useTranslationStore.getState().pipelineSteps.find((s) => s.key === "local-llm-translate"),
    ).toMatchObject({
      status: "error",
      error: "本地 LLM 请求失败",
    });
  });

  it("clears pipeline steps on reset and cancel", async () => {
    const { useTranslationStore } = await import("./translationStore");

    useTranslationStore.getState().initPipelineSteps({
      engine: "cloud",
      mode: "video",
      sourceLang: "日语",
      targetLang: "中文",
      translationFallback: "cloud-then-local",
    });
    useTranslationStore.getState().activatePipelineStep("upload-media");
    useTranslationStore.getState().reset();

    expect(useTranslationStore.getState()).toMatchObject({
      pipelineRoute: null,
      pipelineSteps: [],
      activeStepKey: null,
      appStep: "idle",
    });

    useTranslationStore.getState().initPipelineSteps({
      engine: "cloud",
      mode: "video",
      sourceLang: "日语",
      targetLang: "中文",
      translationFallback: "cloud-then-local",
    });
    useTranslationStore.getState().cancel();

    expect(useTranslationStore.getState()).toMatchObject({
      pipelineRoute: null,
      pipelineSteps: [],
      activeStepKey: null,
      appStep: "idle",
    });
  });
});
