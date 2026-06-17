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
    const resMatch = probeText.match(/(\d{2,5})x(\d{2,5})/);
    if (resMatch) {
      result.width = parseInt(resMatch[1], 10);
      result.height = parseInt(resMatch[2], 10);
    }
    const durMatch = probeText.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (durMatch) {
      const seconds =
        parseInt(durMatch[1], 10) * 3600 + parseInt(durMatch[2], 10) * 60 + parseFloat(durMatch[3]);
      result.durationSeconds = seconds > 0 ? Math.max(1, Math.round(seconds)) : 0;
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
