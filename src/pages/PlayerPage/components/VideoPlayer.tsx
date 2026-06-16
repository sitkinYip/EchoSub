import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import Icon from "@/components/Icon";
import { useKeyboardControls } from "@/pages/PlayerPage/hooks/useKeyboardControls";
import type { HistoryEntry } from "@/types";

interface Props {
  entry: HistoryEntry;
  vttBlobUrl: string;
  onError: (msg: string) => void;
  onClearError: () => void;
}

export default function VideoPlayer({ entry, vttBlobUrl, onError, onClearError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Plyr | null>(null);
  const [assetUrl, setAssetUrl] = useState("");

  useKeyboardControls({ playerRef });

  const hasSubtitles = vttBlobUrl !== "";
  const targetLang = entry.targetLang;

  useEffect(() => {
    setAssetUrl(convertFileSrc(entry.videoPath));
  }, [entry.videoPath]);

  useEffect(() => {
    if (!containerRef.current || !assetUrl) return;
    onClearError();

    const container = containerRef.current;
    container.innerHTML = "";

    const video = document.createElement("video");
    video.src = assetUrl;
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
      if (err) onError(`无法播放: ${err.message || "未知错误"} (code ${err.code})`);
    });

    playerRef.current = player;

    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, [assetUrl, vttBlobUrl, hasSubtitles, targetLang, onError, onClearError]);

  useEffect(
    () => () => {
      playerRef.current?.destroy();
    },
    [],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 min-h-0 relative">
        {!assetUrl ? (
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
      </div>
    </div>
  );
}
