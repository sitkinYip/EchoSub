import { describe, expect, it } from "vitest";
import type { HistoryEntry, Language } from "@/types";
import type { TranslationFallback } from "@/config";
import {
  checkLocalModelGap,
  resolveRegenerateSettings,
  toOverrides,
  type GlobalTranslationSettings,
} from "./translationSettings";

const baseGlobal: GlobalTranslationSettings = {
  engine: "cloud",
  translationFallback: "cloud-then-local",
  whisperModelId: "g-base",
  whisperModelPath: "/global/whisper.bin",
  translateModelId: "tg-base",
  translateModelPath: "/global/translate.gguf",
  uploadVideo: false,
};

function makeHistory(
  overrides: Partial<
    Pick<
      HistoryEntry,
      | "mode"
      | "sourceLang"
      | "targetLang"
      | "engine"
      | "translationFallback"
      | "whisperModelId"
      | "whisperModelPath"
      | "translateModelId"
      | "translateModelPath"
    >
  >,
) {
  return {
    mode: "audio" as const,
    sourceLang: "日语" as Language,
    targetLang: "中文" as Language,
    ...overrides,
  };
}

describe("resolveRegenerateSettings", () => {
  it("fully restores from history when all engine/model fields present", () => {
    const history = makeHistory({
      mode: "video",
      engine: "local",
      translationFallback: "local-only",
      whisperModelId: "h-w",
      whisperModelPath: "/hist/whisper.bin",
      translateModelId: "h-t",
      translateModelPath: "/hist/translate.gguf",
    });

    const result = resolveRegenerateSettings(history, baseGlobal);

    expect(result.restored).toBe(true);
    expect(result.settings).toMatchObject({
      engine: "local",
      translationFallback: "local-only",
      whisperModelId: "h-w",
      whisperModelPath: "/hist/whisper.bin",
      translateModelId: "h-t",
      translateModelPath: "/hist/translate.gguf",
    });
  });

  it("falls back to global when history has no engine settings", () => {
    const history = makeHistory({ mode: "audio" });

    const result = resolveRegenerateSettings(history, baseGlobal);

    expect(result.restored).toBe(false);
    expect(result.settings.engine).toBe("cloud");
    expect(result.settings.whisperModelPath).toBe("/global/whisper.bin");
    expect(result.settings.translateModelPath).toBe("/global/translate.gguf");
  });

  it("falls back to global when history settings are partial", () => {
    const history = makeHistory({
      engine: "local",
      translationFallback: "local-only",
      whisperModelPath: "/hist/whisper.bin",
      // translateModelPath 缺失，视为不完整
    });

    const result = resolveRegenerateSettings(history, baseGlobal);

    expect(result.restored).toBe(false);
    // 仍按字段级降级：engine 取历史，translateModelPath 取全局
    expect(result.settings.engine).toBe("local");
    expect(result.settings.whisperModelPath).toBe("/hist/whisper.bin");
    expect(result.settings.translateModelPath).toBe("/global/translate.gguf");
  });

  it("forces uploadVideo=false when history engine is local even if mode was video", () => {
    const history = makeHistory({
      mode: "video",
      engine: "local",
      translationFallback: "local-only",
      whisperModelId: "h-w",
      whisperModelPath: "/hist/whisper.bin",
      translateModelId: "h-t",
      translateModelPath: "/hist/translate.gguf",
    });

    const result = resolveRegenerateSettings(history, baseGlobal);

    expect(result.settings.uploadVideo).toBe(false);
  });

  it("preserves uploadVideo=true for cloud engine with video mode", () => {
    const history = makeHistory({
      mode: "video",
      engine: "cloud",
      translationFallback: "cloud-then-local",
      whisperModelId: "h-w",
      whisperModelPath: "/hist/whisper.bin",
      translateModelId: "h-t",
      translateModelPath: "/hist/translate.gguf",
    });

    const result = resolveRegenerateSettings(history, baseGlobal);

    expect(result.settings.uploadVideo).toBe(true);
  });

  it("always uses history source/target language regardless of engine settings", () => {
    const history = makeHistory({
      sourceLang: "英语",
      targetLang: "韩语",
    });

    const result = resolveRegenerateSettings(history, baseGlobal);

    expect(result.settings.sourceLang).toBe("英语");
    expect(result.settings.targetLang).toBe("韩语");
  });
});

describe("checkLocalModelGap", () => {
  const base = {
    sourceLang: "日语" as Language,
    targetLang: "中文" as Language,
    translationFallback: "cloud-then-local" as TranslationFallback,
    whisperModelPath: "/w.bin",
    translateModelPath: "/t.gguf",
  };

  it("returns no gap when all required models present", () => {
    expect(checkLocalModelGap(base)).toEqual({
      missing: null,
      needsTranslateModel: false,
    });
  });

  it("flags whisper missing when whisper path empty", () => {
    expect(checkLocalModelGap({ ...base, whisperModelPath: "" })).toEqual({
      missing: "whisper",
      needsTranslateModel: false,
    });
  });

  it("does not require translate model for same-language local", () => {
    const sameLang = { ...base, sourceLang: "中文" as Language, targetLang: "中文" as Language };
    expect(checkLocalModelGap(sameLang)).toEqual({
      missing: null,
      needsTranslateModel: false,
    });
  });

  it("does not require translate model for cross-language non-local-only", () => {
    // cloud-then-local 跨语言走云端翻译，不需要本地翻译模型
    expect(checkLocalModelGap(base).needsTranslateModel).toBe(false);
  });

  it("requires translate model for cross-language local-only", () => {
    const localOnlyCross = {
      ...base,
      translationFallback: "local-only" as TranslationFallback,
    };
    expect(checkLocalModelGap(localOnlyCross).needsTranslateModel).toBe(true);
  });

  it("flags translate missing for local-only cross-language without translate model", () => {
    const localOnlyCrossNoModel = {
      ...base,
      translationFallback: "local-only" as TranslationFallback,
      translateModelPath: "",
    };
    expect(checkLocalModelGap(localOnlyCrossNoModel)).toEqual({
      missing: "translate",
      needsTranslateModel: true,
    });
  });

  it("prioritizes whisper gap over translate gap", () => {
    const bothMissing = {
      ...base,
      translationFallback: "local-only" as TranslationFallback,
      whisperModelPath: "",
      translateModelPath: "",
    };
    expect(checkLocalModelGap(bothMissing).missing).toBe("whisper");
  });
});

describe("toOverrides", () => {
  it("converts resolved settings to a complete overrides object", () => {
    const result = resolveRegenerateSettings(
      makeHistory({
        mode: "video",
        engine: "cloud",
        translationFallback: "cloud-then-local",
        whisperModelId: "h-w",
        whisperModelPath: "/hist/whisper.bin",
        translateModelId: "h-t",
        translateModelPath: "/hist/translate.gguf",
      }),
      baseGlobal,
    );

    const overrides = toOverrides(result.settings);

    expect(overrides).toEqual({
      engine: "cloud",
      translationFallback: "cloud-then-local",
      whisperModelId: "h-w",
      whisperModelPath: "/hist/whisper.bin",
      translateModelId: "h-t",
      translateModelPath: "/hist/translate.gguf",
      sourceLang: "日语",
      targetLang: "中文",
      uploadVideo: true,
    });
  });
});
