import { beforeEach, describe, expect, it, vi } from "vitest";

type CommandListener = (data: { code: number | null; signal: number | null }) => void;

type MockCommand = {
  child: { kill: ReturnType<typeof vi.fn> };
  close: (code?: number | null) => void;
};

const mocks = vi.hoisted(() => {
  const commands: MockCommand[] = [];
  const sidecar = vi.fn(() => {
    let closeListener: CommandListener | null = null;
    const child = { kill: vi.fn().mockResolvedValue(undefined) };
    const command = {
      child,
      stderr: { on: vi.fn() },
      stdout: { on: vi.fn() },
      on: vi.fn((event: string, listener: CommandListener) => {
        if (event === "close") closeListener = listener;
      }),
      spawn: vi.fn(async () => child),
      close: (code: number | null = 0) => closeListener?.({ code, signal: null }),
    };
    commands.push(command);
    return command;
  });
  return { commands, sidecar };
});

vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: { sidecar: mocks.sidecar },
}));

import {
  killAllFfmpeg,
  killFfmpeg,
  killFfmpegGroup,
  runFfmpeg,
  runMakePlayableCopy,
} from "./ffmpegService";

describe("ffmpeg task isolation", () => {
  beforeEach(() => {
    killAllFfmpeg();
    mocks.commands.length = 0;
    mocks.sidecar.mockClear();
  });

  it("translation cancellation does not stop a player job", async () => {
    const translation = runFfmpeg(["-i", "translation.mp4"], "提取音频中...", vi.fn());
    const player = runMakePlayableCopy("source.mkv", "output.mp4", vi.fn());
    await vi.waitFor(() => expect(mocks.commands).toHaveLength(2));

    killFfmpeg();

    expect(mocks.commands[0].child.kill).toHaveBeenCalledTimes(1);
    expect(mocks.commands[1].child.kill).not.toHaveBeenCalled();

    mocks.commands[0].close(null);
    mocks.commands[1].close(0);
    await expect(translation).resolves.toBe(true);
    await expect(player).resolves.toBe(true);
  });

  it("can stop one group or all active groups", async () => {
    const translation = runFfmpeg(["-i", "translation.mp4"], "提取音频中...", vi.fn());
    const player = runMakePlayableCopy("source.mkv", "output.mp4", vi.fn());
    await vi.waitFor(() => expect(mocks.commands).toHaveLength(2));

    killFfmpegGroup("player");
    expect(mocks.commands[0].child.kill).not.toHaveBeenCalled();
    expect(mocks.commands[1].child.kill).toHaveBeenCalledTimes(1);

    killAllFfmpeg();
    expect(mocks.commands[0].child.kill).toHaveBeenCalledTimes(1);
    expect(mocks.commands[1].child.kill).toHaveBeenCalledTimes(1);

    mocks.commands[0].close(null);
    mocks.commands[1].close(null);
    await expect(translation).resolves.toBe(true);
    await expect(player).resolves.toBe(true);
  });

  it("unregisters completed jobs before later cancellation", async () => {
    const translation = runFfmpeg(["-i", "translation.mp4"], "提取音频中...", vi.fn());
    await vi.waitFor(() => expect(mocks.commands).toHaveLength(1));

    mocks.commands[0].close(0);
    await expect(translation).resolves.toBe(true);
    killFfmpeg();

    expect(mocks.commands[0].child.kill).not.toHaveBeenCalled();
  });
});
