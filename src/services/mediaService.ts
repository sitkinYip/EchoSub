import { invoke } from "@tauri-apps/api/core";
import { Command } from "@tauri-apps/plugin-shell";

export const MAX_DURATION_SECONDS = 3 * 60 * 60;

export interface MediaMeta {
  width: number;
  height: number;
  durationSeconds: number;
  size: number;
}

export async function probe(filePath: string): Promise<MediaMeta> {
  const result: MediaMeta = { width: 1920, height: 1080, durationSeconds: 0, size: 0 };
  try {
    const info = (await invoke("get_file_info", { path: filePath }).catch(() => ({ size: 0 }))) as {
      size: number;
    };
    result.size = info.size;
    const cmd = Command.sidecar("binaries/ffmpeg", ["-i", filePath]);
    let stderr = "";
    cmd.stderr.on("data", (d: string) => {
      stderr += d;
    });
    await cmd.execute().catch(() => {});
    const resMatch = stderr.match(/(\d{2,4})x(\d{2,4})/);
    if (resMatch) {
      result.width = parseInt(resMatch[1], 10);
      result.height = parseInt(resMatch[2], 10);
    }
    const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
    if (durMatch) {
      result.durationSeconds =
        parseInt(durMatch[1], 10) * 3600 +
        parseInt(durMatch[2], 10) * 60 +
        parseInt(durMatch[3], 10);
    }
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

export function picks(srcHeight: number): { pass1Scale: string; pass1Label: string } {
  if (srcHeight <= 360) return { pass1Scale: "scale=-2:360", pass1Label: "360p · 压缩码率中..." };
  if (srcHeight <= 480) return { pass1Scale: "scale=-2:360", pass1Label: "480p → 360p 压缩中..." };
  return { pass1Scale: "scale=-2:480", pass1Label: "高清 → 480p 压缩中..." };
}
