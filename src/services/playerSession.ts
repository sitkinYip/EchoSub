import { invoke } from "@tauri-apps/api/core";
import type { MediaMeta } from "./mediaService";

/**
 * 播放器 HLS session 编排层。
 *
 * 封装 Rust 端 media_server 的三个命令，把 session 生命周期（启动/停止）和
 * URL 解析交给调用方。与 `ffmpegService.ts` 的 `"player"` 分组完全分离：
 * 那里只服务一次性兼容副本（`runMakePlayableCopy`），本模块通过 Rust 端
 * spawn 的 ffmpeg 管理 HLS 进程，两者互不干扰。
 *
 * 典型用法：
 *   const meta = await probe(inputPath);
 *   const strategy = chooseStrategy(meta);
 *   const session = await startHlsSession({ inputPath, strategy });
 *   // session.playlistUrl 给 video.src / hls.loadSource
 *   await session.stop();  // 切换视频或卸载时调用
 */

export type HlsStrategy = "remux" | "transcode";

interface PlayerSessionInfo {
  origin: string;
  baseUrl: string;
  playlistUrl: string;
}

interface MediaServerOrigin {
  ready: boolean;
  origin: string;
}

/**
 * 根据 probe 结果选择 HLS 策略：remux（copy）还是 transcode（重编码）。
 *
 * 决策表（保守优先兼容性）：
 * - h264 + 非10bit → remux（视频直接 copy 进 fMP4，几乎零 CPU）
 * - hevc/vp9/av1/mpeg4 等或 10bit 或 probe 拿不到 codec → transcode
 *
 * remux 时音频也 copy：源若是 aac 自然兼容；若是 ac3/eac3，fMP4 可封装且
 * 多数 WebView 能解，少数不能则用户可走完整兼容副本兜底。
 */
export function chooseStrategy(meta: Pick<MediaMeta, "videoCodec" | "isTenBit">): HlsStrategy {
  const codec = meta.videoCodec?.toLowerCase();
  // 仅 H.264（含 avc 别名）+ 8bit 才 remux；其余一律 transcode
  if ((codec === "h264" || codec === "avc") && !meta.isTenBit) {
    return "remux";
  }
  return "transcode";
}

/** 生成 session_id：复用 pipelineSession 的 crypto.randomUUID 策略。 */
function makeSessionId(): string {
  return (
    crypto.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
}

export interface HlsSession {
  /** 给 video.src / hls.loadSource 的完整 playlist URL。 */
  playlistUrl: string;
  /** 实际采用的策略（便于 UI 提示）。 */
  strategy: HlsStrategy;
  /** 实际采用的起始偏移（秒，0 表示从头）。对应 hls.js timelineOffset。 */
  startTime: number;
  /** 是否采用了硬件编码（false=软件 libx264）。 */
  preferHardware: boolean;
  /** 停止该 session 的 ffmpeg 进程并清理临时目录。幂等。 */
  stop(): Promise<void>;
}

/** 查询本地 media server 是否就绪。 */
export async function getMediaServerOrigin(): Promise<MediaServerOrigin> {
  return invoke<MediaServerOrigin>("get_media_server_origin");
}

/** playlist 出现有效分片前等待的最大时长（健康检查用）。 */
const PLAYLIST_HEALTH_DELAY_MS = 2000;

/**
 * 检测 playlist 是否已生成至少一个分片（ffmpeg 启动成功标志）。
 * 硬件编码器不可用时 ffmpeg 会很快退出，playlist 不会有分片。
 */
export async function isPlaylistHealthy(playlistUrl: string): Promise<boolean> {
  try {
    const resp = await fetch(playlistUrl, { cache: "no-store" });
    if (!resp.ok) return false;
    const text = await resp.text();
    // 有效 HLS playlist 含 #EXTINF（分片时长条目）或 #EXT-X-TARGETDURATION + 分片
    return text.includes("#EXTINF");
  } catch {
    return false;
  }
}

function normalizeStartTime(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/**
 * 启动单个 HLS session（不做健康检查/回退）。
 * 返回 session 句柄与用于健康检查的 playlistUrl。
 */
async function spawnSession(params: {
  inputPath: string;
  strategy: HlsStrategy;
  startTime: number;
  preferHardware: boolean;
}): Promise<HlsSession> {
  const sessionId = makeSessionId();
  const dirName = `s${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const info = await invoke<PlayerSessionInfo>("start_player_session", {
    sessionId,
    inputPath: params.inputPath,
    dirName,
    strategy: params.strategy,
    startTime: params.startTime > 0 ? params.startTime : undefined,
    preferHardware: params.preferHardware,
  });

  let stopped = false;
  return {
    playlistUrl: info.playlistUrl,
    strategy: params.strategy,
    startTime: params.startTime,
    preferHardware: params.preferHardware,
    async stop() {
      if (stopped) return;
      stopped = true;
      await invoke("stop_player_session", { sessionId }).catch(() => {});
    },
  };
}

/**
 * 启动一个 HLS session，返回 playlist URL 与停止句柄。
 *
 * 内部生成 session_id 与 dir_name（基于时间戳，避免目录冲突）。
 * 调用方负责在切换视频或组件卸载时调用 `stop()`。
 *
 * 策略由调用方通过 `chooseStrategy(probe(path))` 决定。
 *
 * `startTime` 用于 seek 重启：FFmpeg 用 `-ss startTime` 跳转，前端 hls.js 用
 * `timelineOffset: startTime` 让时间轴显示为源视频绝对时间（非 0）。
 *
 * `preferHardware`（默认 true）：优先尝试平台硬件编码器（macOS=VideoToolbox）。
 * 硬件编码器不可用时（playlist 健康检查无分片）自动回退 libx264 软编。
 *
 * 资源争用：同时运行本地 Whisper 与软件转码会争抢 CPU；软编 -threads 2 已限制。
 */
export async function startHlsSession(params: {
  inputPath: string;
  strategy: HlsStrategy;
  startTime?: number;
  preferHardware?: boolean;
}): Promise<HlsSession> {
  const { ready } = await getMediaServerOrigin();
  if (!ready) {
    throw new Error("本地媒体服务尚未就绪，请稍后重试");
  }

  const startTime = normalizeStartTime(params.startTime);
  const preferHardware = params.preferHardware !== false; // 默认 true

  // 尝试硬件编码（若启用）
  if (preferHardware) {
    const hwSession = await spawnSession({
      inputPath: params.inputPath,
      strategy: params.strategy,
      startTime,
      preferHardware: true,
    });

    // 健康检查：等待 ffmpeg 生成首个分片。失败则回退软编。
    await new Promise((r) => setTimeout(r, PLAYLIST_HEALTH_DELAY_MS));
    if (await isPlaylistHealthy(hwSession.playlistUrl)) {
      return hwSession;
    }
    // 硬件编码器不可用 → 停止并回退软编
    await hwSession.stop().catch(() => {});
  }

  // 软件编码（硬件未启用，或硬件健康检查失败回退）
  return spawnSession({
    inputPath: params.inputPath,
    strategy: params.strategy,
    startTime,
    preferHardware: false,
  });
}

/**
 * 判定一个视频是否值得先尝试直接播放（而非直接走 HLS）。
 *
 * 启发式规则：常见可被 WebView 直接解码的容器/编码走 direct，失败后再回退。
 * 不依赖 probe（当前 probe 拿不到 codec），保持简单且随时可回退。
 */
export function prefersDirectPlayback(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  // MP4/MOV/WebM 容器内的 H.264/AAC 大概率可被所有 WebView 直接播；
  // MKV/AVI/FLV 等容器或 HEVC 编码通常需要 HLS 转码。
  // 注意：即使是 mp4，HEVC 编码在非 Safari 下仍会失败——由 video error 兜底转 HLS。
  return ["mp4", "mov", "webm", "m4v"].includes(ext);
}
