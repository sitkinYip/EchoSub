import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── mock @tauri-apps/api/core 的 invoke ──
const mocks = vi.hoisted(() => {
  // 默认实现始终返回 Promise，模拟真实 invoke 行为
  // mockClear() 后仍保留这个默认实现
  return {
    invoke: vi.fn().mockImplementation(() => Promise.resolve(undefined)),
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
}));

import {
  chooseStrategy,
  getMediaServerOrigin,
  prefersDirectPlayback,
  startHlsSession,
} from "./playerSession";

describe("prefersDirectPlayback", () => {
  it("treats common web-friendly containers as direct", () => {
    expect(prefersDirectPlayback("video.mp4")).toBe(true);
    expect(prefersDirectPlayback("clip.MOV")).toBe(true);
    expect(prefersDirectPlayback("foo.webm")).toBe(true);
    expect(prefersDirectPlayback("a.b.m4v")).toBe(true);
  });

  it("routes mkv/avi/flv and unknown to HLS fallback", () => {
    expect(prefersDirectPlayback("movie.mkv")).toBe(false);
    expect(prefersDirectPlayback("old.avi")).toBe(false);
    expect(prefersDirectPlayback("clip.flv")).toBe(false);
    expect(prefersDirectPlayback("noext")).toBe(false);
  });
});

describe("getMediaServerOrigin", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.invoke.mockImplementation(() => Promise.resolve(undefined));
  });

  it("invokes the rust command", async () => {
    mocks.invoke.mockResolvedValue({ ready: true, origin: "http://127.0.0.1:54321" });
    const result = await getMediaServerOrigin();
    expect(mocks.invoke).toHaveBeenCalledWith("get_media_server_origin");
    expect(result.ready).toBe(true);
  });
});

describe("startHlsSession", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.invoke.mockImplementation(() => Promise.resolve(undefined));
    // mock fetch：健康检查默认返回含分片的 playlist（健康）
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("#EXTM3U\n#EXTINF:4.0,\nseg-00001.m4s\n"),
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when media server is not ready", async () => {
    mocks.invoke.mockResolvedValue({ ready: false, origin: "http://127.0.0.1:0" });
    await expect(
      startHlsSession({ inputPath: "/v.mkv", strategy: "transcode" }),
    ).rejects.toThrow(/尚未就绪/);
  });

  it("starts a session and returns a playlist url + stop handle", async () => {
    // 第一次 invoke: get_media_server_origin
    // 第二次 invoke: start_player_session
    mocks.invoke
      .mockResolvedValueOnce({ ready: true, origin: "http://127.0.0.1:54321" })
      .mockResolvedValueOnce({
        origin: "http://127.0.0.1:54321",
        baseUrl: "/player/abc/",
        playlistUrl: "http://127.0.0.1:54321/player/abc/index.m3u8",
      });

    const session = await startHlsSession({
      inputPath: "/v.mkv",
      strategy: "transcode",
      preferHardware: false,
    });

    expect(session.playlistUrl).toBe(
      "http://127.0.0.1:54321/player/abc/index.m3u8",
    );
    expect(session.strategy).toBe("transcode");
    expect(session.startTime).toBe(0);
    expect(session.preferHardware).toBe(false);
    // start_player_session 必须带 camelCase 参数
    const startCall = mocks.invoke.mock.calls.find(
      (c) => c[0] === "start_player_session",
    );
    expect(startCall?.[1]).toMatchObject({
      inputPath: "/v.mkv",
      strategy: "transcode",
    });
    expect(startCall?.[1].sessionId).toBeTruthy();
    expect(startCall?.[1].dirName).toBeTruthy();

    // stop 调用 stop_player_session
    mocks.invoke.mockClear();
    await session.stop();
    expect(mocks.invoke).toHaveBeenCalledWith("stop_player_session", {
      sessionId: startCall?.[1].sessionId,
    });
  });

  it("stop is idempotent", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ ready: true, origin: "http://127.0.0.1:1" })
      .mockResolvedValueOnce({
        origin: "http://127.0.0.1:1",
        baseUrl: "/player/x/",
        playlistUrl: "http://127.0.0.1:1/player/x/index.m3u8",
      });

    const session = await startHlsSession({
      inputPath: "/v.mkv",
      strategy: "transcode",
      preferHardware: false,
    });

    mocks.invoke.mockClear();
    await session.stop();
    await session.stop(); // 第二次不应再调 invoke
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it("stop swallows errors", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ ready: true, origin: "http://127.0.0.1:1" })
      .mockResolvedValueOnce({
        origin: "http://127.0.0.1:1",
        baseUrl: "/player/x/",
        playlistUrl: "http://127.0.0.1:1/player/x/index.m3u8",
      });

    const session = await startHlsSession({
      inputPath: "/v.mkv",
      strategy: "transcode",
      preferHardware: false,
    });

    mocks.invoke.mockRejectedValueOnce(new Error("session gone"));
    await expect(session.stop()).resolves.toBeUndefined();
  });

  it("forwards startTime to the backend when positive", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ ready: true, origin: "http://127.0.0.1:2" })
      .mockResolvedValueOnce({
        origin: "http://127.0.0.1:2",
        baseUrl: "/player/y/",
        playlistUrl: "http://127.0.0.1:2/player/y/index.m3u8",
      });

    const session = await startHlsSession({
      inputPath: "/v.mkv",
      strategy: "transcode",
      startTime: 125.5,
      preferHardware: false,
    });

    expect(session.startTime).toBe(125.5);
    const startCall = mocks.invoke.mock.calls.find(
      (c) => c[0] === "start_player_session",
    );
    expect(startCall?.[1]).toMatchObject({ startTime: 125.5 });
  });

  it("normalizes invalid startTime to 0 (undefined to backend)", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ ready: true, origin: "http://127.0.0.1:3" })
      .mockResolvedValueOnce({
        origin: "http://127.0.0.1:3",
        baseUrl: "/player/z/",
        playlistUrl: "http://127.0.0.1:3/player/z/index.m3u8",
      });

    const session = await startHlsSession({
      inputPath: "/v.mkv",
      strategy: "transcode",
      startTime: -10, // 负数 → 视为 0
      preferHardware: false,
    });

    expect(session.startTime).toBe(0);
    const startCall = mocks.invoke.mock.calls.find(
      (c) => c[0] === "start_player_session",
    );
    expect(startCall?.[1].startTime).toBeUndefined();
  });

  it("falls back to software encoding when hardware playlist is unhealthy", async () => {
    // 健康检查返回空 playlist（无分片）→ 回退软编
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("#EXTM3U\n#EXT-X-TARGETDURATION:4\n"), // 无 #EXTINF
      }),
    );
    vi.useFakeTimers();

    // invoke 顺序: origin → start(hw) → stop → start(soft)
    mocks.invoke
      .mockResolvedValueOnce({ ready: true, origin: "http://127.0.0.1:9" }) // get_media_server_origin
      .mockResolvedValueOnce({
        // start_player_session (hardware)
        origin: "http://127.0.0.1:9",
        baseUrl: "/player/hw/",
        playlistUrl: "http://127.0.0.1:9/player/hw/index.m3u8",
      })
      .mockResolvedValueOnce(undefined) // stop_player_session
      .mockResolvedValueOnce({
        // start_player_session (software)
        origin: "http://127.0.0.1:9",
        baseUrl: "/player/sw/",
        playlistUrl: "http://127.0.0.1:9/player/sw/index.m3u8",
      });

    const promise = startHlsSession({
      inputPath: "/v.mkv",
      strategy: "transcode",
      preferHardware: true,
    });
    // 推进健康检查的 2s setTimeout
    await vi.advanceTimersByTimeAsync(2000);
    const session = await promise;

    expect(session.preferHardware).toBe(false);
    expect(session.playlistUrl).toContain("/player/sw/");

    // 应有两次 start_player_session：硬件 + 软编
    const startCalls = mocks.invoke.mock.calls.filter(
      (c) => c[0] === "start_player_session",
    );
    expect(startCalls).toHaveLength(2);
    expect(startCalls[0]?.[1]).toMatchObject({ preferHardware: true });
    expect(startCalls[1]?.[1]).toMatchObject({ preferHardware: false });
    // 硬件 session 应被停止
    expect(mocks.invoke.mock.calls.some((c) => c[0] === "stop_player_session")).toBe(true);

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps hardware session when playlist is healthy", async () => {
    // fetch 默认 mock（beforeEach）返回健康 playlist
    mocks.invoke
      .mockResolvedValueOnce({ ready: true, origin: "http://127.0.0.1:9" })
      .mockResolvedValueOnce({
        origin: "http://127.0.0.1:9",
        baseUrl: "/player/hw2/",
        playlistUrl: "http://127.0.0.1:9/player/hw2/index.m3u8",
      });

    vi.useFakeTimers();
    const promise = startHlsSession({
      inputPath: "/v.mkv",
      strategy: "transcode",
      preferHardware: true,
    });
    await vi.advanceTimersByTimeAsync(2000);
    const session = await promise;

    expect(session.preferHardware).toBe(true);
    // 健康时不回退，只一次 start_player_session
    const startCalls = mocks.invoke.mock.calls.filter(
      (c) => c[0] === "start_player_session",
    );
    expect(startCalls).toHaveLength(1);
    expect(mocks.invoke.mock.calls.some((c) => c[0] === "stop_player_session")).toBe(false);

    vi.useRealTimers();
  });
});

describe("chooseStrategy", () => {
  it("chooses remux for h264 8bit", () => {
    expect(chooseStrategy({ videoCodec: "h264", isTenBit: false })).toBe("remux");
    // avc 是 h264 的别名
    expect(chooseStrategy({ videoCodec: "avc", isTenBit: false })).toBe("remux");
    // 大小写不敏感
    expect(chooseStrategy({ videoCodec: "H264", isTenBit: false })).toBe("remux");
  });

  it("chooses transcode for hevc / vp9 / av1 / 10bit", () => {
    expect(chooseStrategy({ videoCodec: "hevc", isTenBit: false })).toBe("transcode");
    expect(chooseStrategy({ videoCodec: "vp9", isTenBit: false })).toBe("transcode");
    expect(chooseStrategy({ videoCodec: "av1", isTenBit: false })).toBe("transcode");
    // h264 但 10bit 仍需转码
    expect(chooseStrategy({ videoCodec: "h264", isTenBit: true })).toBe("transcode");
  });

  it("falls back to transcode when codec is unknown", () => {
    expect(chooseStrategy({ videoCodec: undefined, isTenBit: false })).toBe("transcode");
    expect(chooseStrategy({ videoCodec: "mpeg4", isTenBit: false })).toBe("transcode");
  });
});
