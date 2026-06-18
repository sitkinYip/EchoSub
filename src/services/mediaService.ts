import { invoke } from "@tauri-apps/api/core";
import { Command } from "@tauri-apps/plugin-shell";

export const MAX_DURATION_SECONDS = 3 * 60 * 60;

export interface MediaMeta {
  width: number;
  height: number;
  durationSeconds: number;
  size: number;
  /** 视频编码（hevc/h264/vp9/av1 等），probe 失败时为 undefined。 */
  videoCodec?: string;
  /** 音频编码（aac/ac3/opus/flac 等），probe 失败时为 undefined。 */
  audioCodec?: string;
  /** 像素格式（yuv420p/yuv420p10le 等），用于判断 10bit。 */
  pixelFormat?: string;
  /** 是否 10bit 及以上（yuv420p10le/p010le 等）。 */
  isTenBit: boolean;
}

/**
 * 从 ffmpeg `-i` 的 stderr 输出解析流信息。
 * 纯函数，便于单测——不依赖真实 ffmpeg。
 */
export function parseStreamInfo(probeText: string): {
  width: number;
  height: number;
  durationSeconds: number;
  videoCodec?: string;
  audioCodec?: string;
  pixelFormat?: string;
  isTenBit: boolean;
} {
  // 分辨率：取最后的 NxN（避免误匹配 codec 标签里的数字）
  let width = 0;
  let height = 0;
  const resMatch = probeText.match(/(\d{2,5})x(\d{2,5})/);
  if (resMatch) {
    width = parseInt(resMatch[1], 10);
    height = parseInt(resMatch[2], 10);
  }

  // 时长：Duration: HH:MM:SS.xx
  let durationSeconds = 0;
  const durMatch = probeText.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (durMatch) {
    const seconds =
      parseInt(durMatch[1], 10) * 3600 +
      parseInt(durMatch[2], 10) * 60 +
      parseFloat(durMatch[3]);
    durationSeconds = seconds > 0 ? Math.max(1, Math.round(seconds)) : 0;
  }

  // 视频流：Stream #0:0...: Video: <codec> ..., <pixfmt>,
  // 示例：Video: hevc (Main 10) (hvc1), yuv420p10le(tv), 1920x1080
  let videoCodec: string | undefined;
  let pixelFormat: string | undefined;
  const videoMatch = probeText.match(/Stream #[^:]*:\d+.*?:\s*Video:\s*(\w+)/);
  if (videoMatch) {
    videoCodec = videoMatch[1].toLowerCase();
  }
  // 像素格式紧跟在 Video: codec 后，逗号分隔的下一项
  // 尝试匹配 "Video: <codec> (...), <pixfmt>"
  const pixFmtMatch = probeText.match(
    /Video:\s*\w+[^,]*,\s*([a-z0-9]+(?:10)?[a-z0-9]*)/i,
  );
  if (pixFmtMatch) {
    pixelFormat = pixFmtMatch[1].toLowerCase();
  }
  const isTenBit = /10le|10be|p010/.test(pixelFormat || "");

  // 音频流：Stream #0:1...: Audio: <codec>
  let audioCodec: string | undefined;
  const audioMatch = probeText.match(/Stream #[^:]*:\d+.*?:\s*Audio:\s*(\w+)/);
  if (audioMatch) {
    audioCodec = audioMatch[1].toLowerCase();
  }

  return { width, height, durationSeconds, videoCodec, audioCodec, pixelFormat, isTenBit };
}

export async function probe(filePath: string): Promise<MediaMeta> {
  const result: MediaMeta = {
    width: 1920,
    height: 1080,
    durationSeconds: 0,
    size: 0,
    isTenBit: false,
  };
  try {
    const info = (await invoke("get_file_info", { path: filePath }).catch(() => ({ size: 0 }))) as {
      size: number;
    };
    result.size = info.size;
    // 注意：probe 用 execute() 一次性执行（短任务，几秒内完成），
    // 不进入 ffmpegService 的分组管理。这是已知限制——probe 无需中途取消，
    // 且 execute() 不返回 child 句柄无法注册。长生命周期的 HLS 由 Rust 端独立管理。
    const cmd = Command.sidecar("binaries/ffmpeg", ["-hide_banner", "-i", filePath]);
    let stderr = "";
    let stdout = "";
    cmd.stderr.on("data", (d: string) => {
      stderr += d;
    });
    cmd.stdout.on("data", (d: string) => {
      stdout += d;
    });
    const output = await cmd.execute().catch((err: unknown) => {
      console.debug("[probe] ffmpeg probe exited with error:", err);
      return null;
    });
    if (output) {
      stderr += output.stderr || "";
      stdout += output.stdout || "";
    }

    const probeText = `${stderr}\n${stdout}`;
    const parsed = parseStreamInfo(probeText);
    if (parsed.width > 0) result.width = parsed.width;
    if (parsed.height > 0) result.height = parsed.height;
    result.durationSeconds = parsed.durationSeconds;
    result.videoCodec = parsed.videoCodec;
    result.audioCodec = parsed.audioCodec;
    result.pixelFormat = parsed.pixelFormat;
    result.isTenBit = parsed.isTenBit;
  } catch (err) {
    console.warn("[probe] 文件探测失败:", err);
    throw new Error(`无法分析媒体文件: ${err instanceof Error ? err.message : err}`);
  }
  return result;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h} 小时 ${m} 分 ${s} 秒` : `${m} 分 ${s} 秒`;
}

export function formatMediaSummary(meta: Pick<MediaMeta, "durationSeconds" | "size">): string {
  const sizeMB = (meta.size / 1024 / 1024).toFixed(1);
  if (meta.durationSeconds > 0) {
    return `时长 ${formatDuration(meta.durationSeconds)}，大小 ${sizeMB} MB`;
  }
  return `大小 ${sizeMB} MB，时长暂未识别`;
}

export function picks(srcHeight: number): { pass1Scale: string; pass1Label: string } {
  if (srcHeight <= 360) return { pass1Scale: "scale=-2:360", pass1Label: "360p · 压缩码率中..." };
  if (srcHeight <= 480) return { pass1Scale: "scale=-2:360", pass1Label: "480p → 360p 压缩中..." };
  return { pass1Scale: "scale=-2:480", pass1Label: "高清 → 480p 压缩中..." };
}
