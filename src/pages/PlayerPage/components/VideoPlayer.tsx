import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import Hls from "hls.js";
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import Icon from "@/components/Icon";
import { useKeyboardControls } from "@/pages/PlayerPage/hooks/useKeyboardControls";
import type { HistoryEntry } from "@/types";

interface Props {
  entry: HistoryEntry;
  sourcePath?: string;
  /** HLS playlist URL（来自 PlayerPage 启动的 session）。为空时走 direct 播放。 */
  hlsUrl?: string;
  compatCopyPath?: string;
  vttBlobUrl: string;
  onError: (msg: string) => void;
  onClearError: () => void;
  onDeleteCompatCopy?: () => void;
}

export default function VideoPlayer({
  entry,
  sourcePath,
  hlsUrl,
  compatCopyPath,
  vttBlobUrl,
  onError,
  onClearError,
  onDeleteCompatCopy,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Plyr | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [loading, setLoading] = useState(false);

  useKeyboardControls({ playerRef });

  const hasSubtitles = vttBlobUrl !== "";
  const targetLang = entry.targetLang;

  // 派生播放源：HLS 模式用 hlsUrl，否则 convertFileSrc 直出
  const assetUrl = hlsUrl || convertFileSrc(sourcePath || entry.videoPath);

  useEffect(() => {
    if (!containerRef.current || !assetUrl) return;
    onClearError();

    const container = containerRef.current;
    container.innerHTML = "";

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.playsInline = true;
    video.className = "w-full h-full";

    if (hasSubtitles) {
      const track = document.createElement("track");
      track.kind = "captions";
      track.label = targetLang;
      track.src = vttBlobUrl;
      track.default = true;
      video.appendChild(track);
    }

    // ── 源绑定：HLS 走 hls.js/原生，其余 direct ──
    if (hlsUrl) {
      // Safari 原生支持 HLS（application/vnd.apple.mpegurl）
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = hlsUrl;
      } else if (Hls.isSupported()) {
        setLoading(true);
        const hls = new Hls({ lowLatencyMode: false, enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => setLoading(false));
        // 致命错误上报给 PlayerPage，由其决定回退
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            onError(`HLS 播放失败: ${data.details || data.type}`);
          }
        });
      } else {
        onError("当前 WebView 不支持 HLS 播放");
      }
    } else {
      video.src = assetUrl;
    }

    container.appendChild(video);

    const player = new Plyr(video, {
      controls: [
        "play-large",
        "play",
        "progress",
        "current-time",
        "mute",
        "volume",
        "captions",
        "settings",
        "pip",
        "fullscreen",
      ],
      captions: { active: hasSubtitles, language: "auto", update: true },
      i18n: {
        captions: "字幕",
        enableCaptions: "开启字幕",
        disableCaptions: "关闭字幕",
      } as Partial<Plyr.Options["i18n"]>,
      ratio: "16:9",
    });

    player.once("ready", () => {
      if (hasSubtitles) player.toggleCaptions(true);
      const btn = container.querySelector("[data-plyr='captions']") as HTMLElement | null;
      if (btn) {
        const on = () => {
          btn.style.fontWeight = "600";
          btn.style.color = "var(--c-accent, #60A5FA)";
        };
        const off = () => {
          btn.style.fontWeight = "400";
          btn.style.color = "var(--c-text-secondary, rgba(255,255,255,0.6))";
        };
        if (hasSubtitles) on();
        else off();
        player.on("captionsenabled", on);
        player.on("captionsdisabled", off);
        for (const c of btn.childNodes) {
          if (c.nodeType === 3 && c.textContent?.trim() === "CC") {
            c.textContent = "字幕";
            break;
          }
        }
      }
    });

    video.addEventListener("error", () => {
      const err = video.error;
      if (err) {
        // code 4 = MEDIA_ERR_SRC_NOT_SUPPORTED（HEVC/MKV 等典型失败）
        onError(`无法播放: ${err.message || "未知错误"} (code ${err.code})`);
      }
    });

    playerRef.current = player;

    return () => {
      // 销毁 hls.js 实例（若有）；Plyr 销毁
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      player.destroy();
      playerRef.current = null;
      setLoading(false);
    };
  }, [assetUrl, hlsUrl, vttBlobUrl, hasSubtitles, targetLang, onError, onClearError]);

  useEffect(
    () => () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      playerRef.current?.destroy();
      playerRef.current = null;
    },
    [],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 min-h-0 relative">
        {!assetUrl || loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
          </div>
        ) : (
          <div ref={containerRef} className="absolute inset-0 plyr-fill" />
        )}
      </div>
      <div className="flex-shrink-0 flex items-center gap-4 px-6 py-3 bg-app-elevated border-t border-app-border">
        <Icon name="video" className="w-4 h-4 text-app-text-secondary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-app-text truncate">{entry.videoName}</p>
          <p className="text-[10px] text-app-text-tertiary">
            {entry.sourceLang} → {entry.targetLang} · {entry.subtitles.length} 条字幕
          </p>
        </div>
        <span className="text-[10px] text-app-text-tertiary">
          {entry.mode === "video" ? "视频模式" : "音频模式"}
        </span>
        {compatCopyPath && onDeleteCompatCopy && (
          <button
            type="button"
            onClick={onDeleteCompatCopy}
            className="text-[10px] text-app-text-tertiary hover:text-app-error transition-colors"
          >
            删除兼容副本
          </button>
        )}
      </div>
    </div>
  );
}
