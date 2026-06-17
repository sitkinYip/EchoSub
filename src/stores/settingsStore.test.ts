import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const storeData = new Map<string, unknown>();
  return {
    storeData,
    invoke: vi.fn(),
    storeGet: vi.fn((key: string) => Promise.resolve(storeData.get(key))),
    storeSet: vi.fn((key: string, value: unknown) => {
      storeData.set(key, value);
      return Promise.resolve();
    }),
    storeSave: vi.fn(() => Promise.resolve()),
    checkWhisperModelExists: vi.fn(),
    checkTranslateModelExists: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-store", () => ({
  Store: {
    load: vi.fn(() =>
      Promise.resolve({
        get: mocks.storeGet,
        set: mocks.storeSet,
        save: mocks.storeSave,
      }),
    ),
  },
}));
vi.mock("@/services/whisperService", () => ({
  checkWhisperModelExists: mocks.checkWhisperModelExists,
  checkTranslateModelExists: mocks.checkTranslateModelExists,
}));

describe("settingsStore local model validation", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.storeData.clear();
    mocks.invoke.mockReset();
    mocks.storeGet.mockClear();
    mocks.storeSet.mockClear();
    mocks.storeSave.mockClear();
    mocks.checkWhisperModelExists.mockReset();
    mocks.checkTranslateModelExists.mockReset();
    mocks.invoke.mockResolvedValue("");
  });

  it("clears stale local model selections when loading persisted settings", async () => {
    mocks.storeData.set("engine", "local");
    mocks.storeData.set("whisperModelId", "base");
    mocks.storeData.set("whisperModelPath", "/models/ggml-base.bin");
    mocks.storeData.set("translateModelId", "qwen3-4b-instruct-q4");
    mocks.storeData.set("translateModelPath", "/models/qwen.gguf");
    mocks.checkWhisperModelExists.mockResolvedValue(false);
    mocks.checkTranslateModelExists.mockResolvedValue(false);

    const { useSettingsStore } = await import("./settingsStore");

    await useSettingsStore.getState().load();

    expect(mocks.checkWhisperModelExists).toHaveBeenCalledWith("base");
    expect(mocks.checkTranslateModelExists).toHaveBeenCalledWith("qwen3-4b-instruct-q4");
    expect(mocks.storeSet).toHaveBeenCalledWith("whisperModelId", "");
    expect(mocks.storeSet).toHaveBeenCalledWith("whisperModelPath", "");
    expect(mocks.storeSet).toHaveBeenCalledWith("translateModelId", "");
    expect(mocks.storeSet).toHaveBeenCalledWith("translateModelPath", "");
    expect(mocks.storeSave).toHaveBeenCalled();
    expect(useSettingsStore.getState()).toMatchObject({
      whisperModelId: "",
      whisperModelPath: "",
      translateModelId: "",
      translateModelPath: "",
      loaded: true,
    });
  });
});
