import { Command, type Child } from "@tauri-apps/plugin-shell";
import type { TranslationState } from "@/stores/translationStore";

export type SetState = (p: Partial<TranslationState>) => void;

const activeChildren = new Set<Child>();

export function killFfmpeg() {
  for (const child of activeChildren) {
    try {
      child.kill().catch(() => {});
    } catch {
      // Process may already be gone.
    }
  }
  activeChildren.clear();
}

export async function runFfmpeg(
  args: string[],
  progressLabel: string,
  set: SetState,
): Promise<boolean> {
  let cmd;
  try {
    cmd = Command.sidecar("binaries/ffmpeg", args);
  } catch (e) {
    set({
      error: `无法启动 FFmpeg: ${e instanceof Error ? e.message : String(e)}`,
      progress: "无法启动 FFmpeg",
    });
    return false;
  }

  const start = Date.now();
  let buf = "",
    lastFrame = 0,
    lastTime = "",
    lastSpeed = "",
    lastUI = 0,
    firstChunk = true;

  const parse = () => {
    const fm = buf.match(/frame=\s*(\d+)/g);
    if (fm) lastFrame = parseInt(fm[fm.length - 1].match(/\d+/)![0], 10);
    const tm = buf.match(/time=(\d+:\d+:\d+[.\d]*)/g);
    if (tm) lastTime = tm[tm.length - 1].match(/\d+:\d+:\d+[.\d]*/)![0];
    const sm = buf.match(/speed=\s*([\d.]+)x/);
    if (sm) lastSpeed = sm[1] + "x";
  };

  // Register close/error listeners BEFORE spawn
  const exitPromise = new Promise<{ code: number | null }>((resolve, reject) => {
    cmd.on("close", (data: { code: number | null; signal: number | null }) =>
      resolve({ code: data.code }),
    );
    cmd.on("error", (err: string) => reject(new Error(err)));
  });

  const heartbeat = setInterval(() => {
    parse();
    const parts: string[] = [];
    if (lastFrame > 0) parts.push(`帧 ${lastFrame}`);
    if (lastTime) parts.push(lastTime);
    if (lastSpeed) parts.push(lastSpeed);
    parts.push(`已用时 ${Math.round((Date.now() - start) / 1000)}s`);
    set({ progress: `${progressLabel} (${parts.join(" · ")})` });
  }, 2000);

  cmd.stderr.on("data", (d: string) => {
    buf += d;
    if (buf.length > 20000) buf = buf.slice(-12000);
    if (firstChunk) {
      console.debug("[FFmpeg stderr first chunk]:", JSON.stringify(d.slice(0, 300)));
      firstChunk = false;
    }
    const now = Date.now();
    if (now - lastUI < 500) return;
    lastUI = now;
    parse();
    const parts: string[] = [];
    if (lastFrame > 0) parts.push(`帧 ${lastFrame}`);
    if (lastTime) parts.push(lastTime);
    if (lastSpeed) parts.push(lastSpeed);
    parts.push(`已用时 ${Math.round((now - start) / 1000)}s`);
    set({ progress: `${progressLabel} (${parts.join(" · ")})` });
  });
  cmd.stdout.on("data", (d: string) => {
    buf += d;
  });

  let child;
  try {
    child = await cmd.spawn();
  } catch (e) {
    clearInterval(heartbeat);
    set({
      error: `无法启动 FFmpeg: ${e instanceof Error ? e.message : String(e)}`,
      progress: "无法启动 FFmpeg",
    });
    return false;
  }

  activeChildren.add(child);

  try {
    const result = await exitPromise;
    clearInterval(heartbeat);
    activeChildren.delete(child);

    // exitCode is null when killed by signal — not an error we should report
    if (result.code !== 0 && result.code !== null) {
      const tail = buf.slice(-800);
      console.error("[FFmpeg] exit code:", result.code, "\nstderr tail:", tail);
      set({ error: `FFmpeg 退出码 ${result.code}: ${tail || "无错误输出"}` });
      return false;
    }
    return true;
  } catch (e: unknown) {
    clearInterval(heartbeat);
    activeChildren.delete(child);
    // Silently absorb "killed" errors
    if (e instanceof Error && e.message === "killed") return false;
    set({
      error: `FFmpeg 进程异常: ${e instanceof Error ? e.message : String(e)}`,
      progress: "FFmpeg 进程异常终止",
    });
    return false;
  }
}

export async function runExtractAudio(
  videoPath: string,
  outputPath: string,
  set: SetState,
): Promise<boolean> {
  return runFfmpeg(
    ["-i", videoPath, "-b:a", "64k", "-ac", "1", "-y", outputPath],
    "提取音频中...",
    set,
  );
}

/**
 * 提取 16kHz 单声道 f32 PCM WAV —— whisper.cpp 的输入格式要求。
 * 仅本地 Whisper 引擎使用；云端管线仍走 runExtractAudio（mp3）。
 */
export async function runExtractWav16kMono(
  sourcePath: string,
  outputPath: string,
  set: SetState,
): Promise<boolean> {
  return runFfmpeg(
    [
      "-i",
      sourcePath,
      "-ar",
      "16000", // 16 kHz
      "-ac",
      "1", // 单声道
      "-c:a",
      "pcm_f32le", // 32-bit float little-endian PCM
      "-y",
      outputPath,
    ],
    "提取 16kHz 音频中...",
    set,
  );
}

export async function runMakePlayableCopy(
  sourcePath: string,
  outputPath: string,
  onProgress: (message: string) => void,
): Promise<boolean> {
  const strategies = [
    {
      label: "生成兼容副本中...",
      args: [
        "-i",
        sourcePath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "copy",
        "-tag:v",
        "hvc1",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        "-y",
        outputPath,
      ],
    },
    {
      label: "转码为兼容格式中...",
      args: [
        "-i",
        sourcePath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        "-y",
        outputPath,
      ],
    },
  ];

  for (const strategy of strategies) {
    const ok = await runPlayerFfmpeg(strategy.args, strategy.label, onProgress);
    if (ok) return true;
  }
  return false;
}

async function runPlayerFfmpeg(
  args: string[],
  progressLabel: string,
  onProgress: (message: string) => void,
): Promise<boolean> {
  let cmd;
  try {
    cmd = Command.sidecar("binaries/ffmpeg", args);
  } catch (e) {
    onProgress(`无法启动 FFmpeg: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }

  const start = Date.now();
  let buf = "";
  let lastTime = "";
  let lastSpeed = "";

  const parse = () => {
    const tm = buf.match(/time=(\d+:\d+:\d+[.\d]*)/g);
    if (tm) lastTime = tm[tm.length - 1].match(/\d+:\d+:\d+[.\d]*/)![0];
    const sm = buf.match(/speed=\s*([\d.]+)x/g);
    if (sm) lastSpeed = sm[sm.length - 1].match(/[\d.]+/)![0] + "x";
  };

  const exitPromise = new Promise<{ code: number | null }>((resolve, reject) => {
    cmd.on("close", (data: { code: number | null; signal: number | null }) =>
      resolve({ code: data.code }),
    );
    cmd.on("error", (err: string) => reject(new Error(err)));
  });

  const update = () => {
    parse();
    const parts: string[] = [];
    if (lastTime) parts.push(lastTime);
    if (lastSpeed) parts.push(lastSpeed);
    parts.push(`已用时 ${Math.round((Date.now() - start) / 1000)}s`);
    onProgress(`${progressLabel} (${parts.join(" · ")})`);
  };

  const heartbeat = setInterval(update, 2000);
  cmd.stderr.on("data", (d: string) => {
    buf += d;
    if (buf.length > 20000) buf = buf.slice(-12000);
    update();
  });

  let child;
  try {
    child = await cmd.spawn();
  } catch (e) {
    clearInterval(heartbeat);
    onProgress(`无法启动 FFmpeg: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }

  activeChildren.add(child);

  try {
    const result = await exitPromise;
    clearInterval(heartbeat);
    activeChildren.delete(child);
    if (result.code !== 0 && result.code !== null) {
      console.warn("[Player FFmpeg] exit code:", result.code, "\nstderr tail:", buf.slice(-800));
      return false;
    }
    return true;
  } catch (e) {
    clearInterval(heartbeat);
    activeChildren.delete(child);
    onProgress(`FFmpeg 进程异常: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}
