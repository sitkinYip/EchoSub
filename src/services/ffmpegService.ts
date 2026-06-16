import { Command, type Child } from "@tauri-apps/plugin-shell";
import type { TranslationState } from "@/stores/translationStore";

export type SetState = (p: Partial<TranslationState>) => void;

const activeChildren = new Set<Child>();

export function killFfmpeg() {
  for (const child of activeChildren) {
    try { child.kill().catch(() => {}); } catch {}
  }
  activeChildren.clear();
}

export async function runFfmpeg(
  args: string[], progressLabel: string,
  set: SetState,
): Promise<boolean> {
  let cmd;
  try { cmd = Command.sidecar("binaries/ffmpeg", args); }
  catch (e) { set({ error: `无法启动 FFmpeg: ${e instanceof Error ? e.message : String(e)}`, progress: "无法启动 FFmpeg" }); return false; }

  const start = Date.now();
  let buf = "", lastFrame = 0, lastTime = "", lastSpeed = "", lastUI = 0, firstChunk = true;

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
    cmd.on("close", (data: { code: number | null; signal: number | null }) => resolve({ code: data.code }));
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
    buf += d; if (buf.length > 20000) buf = buf.slice(-12000);
    if (firstChunk) { console.log("[FFmpeg stderr first chunk]:", JSON.stringify(d.slice(0, 300))); firstChunk = false; }
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
  cmd.stdout.on("data", (d: string) => { buf += d; });

  let child;
  try { child = await cmd.spawn(); }
  catch (e) {
    clearInterval(heartbeat);
    set({ error: `无法启动 FFmpeg: ${e instanceof Error ? e.message : String(e)}`, progress: "无法启动 FFmpeg" });
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
  } catch (e: any) {
    clearInterval(heartbeat);
    activeChildren.delete(child);
    // Silently absorb "killed" errors
    if (e?.message === "killed") return false;
    set({ error: `FFmpeg 进程异常: ${e instanceof Error ? e.message : String(e)}`, progress: "FFmpeg 进程异常终止" });
    return false;
  }
}

export async function runExtractAudio(
  videoPath: string, outputPath: string,
  set: SetState,
): Promise<boolean> {
  return runFfmpeg(["-i", videoPath, "-b:a", "64k", "-ac", "1", "-y", outputPath], "提取音频中...", set);
}
