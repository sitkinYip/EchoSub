import { invoke } from "@tauri-apps/api/core";

/**
 * 播放器 HLS session 编排层。
 *
 * 封装 Rust 端 media_server 的三个命令，把 session 生命周期（启动/停止）和
 * URL 解析交给调用方。与 `ffmpegService.ts` 的 `"player"` 分组完全分离：
 * 那里只服务一次性兼容副本（`runMakePlayableCopy`），本模块通过 Rust 端
 * spawn 的 ffmpeg 管理 HLS 进程，两者互不干扰。
 *
 * 典型用法：
 *   const session = await startHlsSession({ inputPath, strategy: "transcode" });
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
  /** 停止该 session 的 ffmpeg 进程并清理临时目录。幂等。 */
  stop(): Promise<void>;
}

/** 查询本地 media server 是否就绪。 */
export async function getMediaServerOrigin(): Promise<MediaServerOrigin> {
  return invoke<MediaServerOrigin>("get_media_server_origin");
}

/**
 * 启动一个 HLS session，返回 playlist URL 与停止句柄。
 *
 * 内部生成 session_id 与 dir_name（基于时间戳，避免目录冲突）。
 * 调用方负责在切换视频或组件卸载时调用 `stop()`。
 */
export async function startHlsSession(params: {
  inputPath: string;
  strategy: HlsStrategy;
}): Promise<HlsSession> {
  const { ready } = await getMediaServerOrigin();
  if (!ready) {
    throw new Error("本地媒体服务尚未就绪，请稍后重试");
  }

  const sessionId = makeSessionId();
  // dir_name 仅允许 [A-Za-z0-9_-]，用时间戳 + 随机串构造
  const dirName = `s${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const info = await invoke<PlayerSessionInfo>("start_player_session", {
    sessionId,
    inputPath: params.inputPath,
    dirName,
    strategy: params.strategy,
  });

  let stopped = false;
  return {
    playlistUrl: info.playlistUrl,
    async stop() {
      if (stopped) return;
      stopped = true;
      await invoke("stop_player_session", { sessionId }).catch(() => {});
    },
  };
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
