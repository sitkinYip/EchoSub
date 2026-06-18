import { describe, expect, it } from "vitest";
import { formatDuration, formatMediaSummary, parseStreamInfo } from "./mediaService";

describe("mediaService formatting", () => {
  it("formats known durations with file size", () => {
    expect(formatDuration(65)).toBe("1 分 5 秒");
    expect(formatMediaSummary({ durationSeconds: 65, size: 10 * 1024 * 1024 })).toBe(
      "时长 1 分 5 秒，大小 10.0 MB",
    );
  });

  it("does not display fake zero-second duration when probe cannot read duration", () => {
    expect(formatMediaSummary({ durationSeconds: 0, size: 10 * 1024 * 1024 })).toBe(
      "大小 10.0 MB，时长暂未识别",
    );
  });
});

describe("parseStreamInfo", () => {
  // 真实 ffmpeg `-i` stderr 样本
  const H264_AAC_MP4 = `  Duration: 00:01:05.23, start: 0.000000, bitrate: 2456 kb/s
    Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709), 1920x1080 [SAR 1:1 DAR 16:9], 2200 kb/s, 30 fps, 30 tbr
    Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s`;

  const HEVC_10BIT_MKV = `  Duration: 02:13:51.00, start: 0.000000, bitrate: 8921 kb/s
    Stream #0:0: Video: hevc (Main 10), yuv420p10le(tv), 3840x2160 [SAR 1:1 DAR 16:9], 8800 kb/s, 24 fps
    Stream #0:1: Audio: ac3, 48000 Hz, 5.1, fltp, 448 kb/s`;

  const VP9_WEBM = `  Duration: 00:10:00.00, bitrate: 1500 kb/s
    Stream #0:0: Video: vp9, yuv420p, 1280x720, 30 fps
    Stream #0:1: Audio: opus, 48000 Hz, stereo, fltp`;

  it("parses h264 + aac as remux-friendly (8bit)", () => {
    const r = parseStreamInfo(H264_AAC_MP4);
    expect(r.videoCodec).toBe("h264");
    expect(r.audioCodec).toBe("aac");
    expect(r.pixelFormat).toBe("yuv420p");
    expect(r.isTenBit).toBe(false);
    expect(r.width).toBe(1920);
    expect(r.height).toBe(1080);
    expect(r.durationSeconds).toBe(65);
  });

  it("parses hevc 10bit + ac3 as transcode-required", () => {
    const r = parseStreamInfo(HEVC_10BIT_MKV);
    expect(r.videoCodec).toBe("hevc");
    expect(r.audioCodec).toBe("ac3");
    expect(r.pixelFormat).toBe("yuv420p10le");
    expect(r.isTenBit).toBe(true);
    expect(r.width).toBe(3840);
    expect(r.height).toBe(2160);
    expect(r.durationSeconds).toBe(8031); // 2*3600 + 13*60 + 51
  });

  it("parses vp9 + opus", () => {
    const r = parseStreamInfo(VP9_WEBM);
    expect(r.videoCodec).toBe("vp9");
    expect(r.audioCodec).toBe("opus");
    expect(r.isTenBit).toBe(false);
    expect(r.durationSeconds).toBe(600);
  });

  it("returns empty fields for unparseable output", () => {
    const r = parseStreamInfo("some garbage without streams");
    expect(r.videoCodec).toBeUndefined();
    expect(r.audioCodec).toBeUndefined();
    expect(r.isTenBit).toBe(false);
    expect(r.width).toBe(0);
    expect(r.durationSeconds).toBe(0);
  });
});
