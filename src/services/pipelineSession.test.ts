import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const killFfmpeg = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("./ffmpegService", () => ({ killFfmpeg }));

describe("pipelineSession", () => {
  beforeEach(() => {
    vi.resetModules();
    invoke.mockReset();
    killFfmpeg.mockReset();
    invoke.mockResolvedValue("/tmp/generated.mp3");
  });

  it("creates task-scoped sessions and retires the previous session", async () => {
    const { newSession, trackTemp } = await import("./pipelineSession");

    const first = newSession();
    trackTemp(first, "/tmp/old.mp3");
    const second = newSession();

    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
    expect(invoke).toHaveBeenCalledWith("cancel_task", { taskId: first.taskId });
    expect(invoke).toHaveBeenCalledWith("delete_file", { path: "/tmp/old.mp3" });
    expect(killFfmpeg).toHaveBeenCalledTimes(1);
  });

  it("guards state writes from stale sessions", async () => {
    const { newSession, safeSet } = await import("./pipelineSession");
    const set = vi.fn();

    const first = newSession();
    const firstSet = safeSet(first, set);
    const second = newSession();
    const secondSet = safeSet(second, set);

    firstSet({ progress: "stale" });
    secondSet({ progress: "fresh" });

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ progress: "fresh" });
  });

  it("delegates temp path creation to Rust", async () => {
    const { createTempPath } = await import("./pipelineSession");

    await expect(createTempPath("mp3")).resolves.toBe("/tmp/generated.mp3");
    expect(invoke).toHaveBeenCalledWith("create_temp_media_path", { ext: "mp3" });
  });
});
