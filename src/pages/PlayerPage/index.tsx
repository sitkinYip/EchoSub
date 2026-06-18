import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import Icon from "@/components/Icon";
import { showMessage } from "@/components/Toast/create";
import { runMakePlayableCopy } from "@/services/ffmpegService";
import { useHistoryStore } from "@/stores/historyStore";
import { itemsToVtt } from "@/utils/srtParser";
import {
  startHlsSession,
  type HlsSession,
} from "@/services/playerSession";
import VideoSidebar from "./components/VideoSidebar";
import VideoPlayer from "./components/VideoPlayer";
import type { HistoryEntry } from "@/types";

type PlayerTab = "translated" | "local";

export default function PlayerPage() {
  const { history, historyLoaded, load } = useHistoryStore();
  const [activeTab, setActiveTab] = useState<PlayerTab>("translated");
  const [activeEntry, setActiveEntry] = useState<HistoryEntry | null>(null);
  const [vttBlobUrl, setVttBlobUrl] = useState("");
  const [playbackPath, setPlaybackPath] = useState("");
  const [hlsUrl, setHlsUrl] = useState("");
  const [loadError, setLoadError] = useState("");
  const [hlsLoading, setHlsLoading] = useState(false);
  const [compatProgress, setCompatProgress] = useState("");
  const [makingCompatCopy, setMakingCompatCopy] = useState(false);
  const tempPlaybackByEntryRef = useRef<Record<string, string>>({});
  const blobRef = useRef("");
  // 当前活跃的 HLS session；切视频/卸载时停止
  const hlsSessionRef = useRef<HlsSession | null>(null);

  const getEntryKey = useCallback((entry: HistoryEntry) => `${entry.id}:${entry.videoPath}`, []);

  const stopActiveHlsSession = useCallback(() => {
    if (hlsSessionRef.current) {
      hlsSessionRef.current.stop().catch(() => {});
      hlsSessionRef.current = null;
    }
    setHlsUrl("");
  }, []);

  useEffect(() => {
    if (!historyLoaded) load();
  }, []);
  useEffect(
    () => () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
      if (hlsSessionRef.current) {
        hlsSessionRef.current.stop().catch(() => {});
        hlsSessionRef.current = null;
      }
      for (const path of Object.values(tempPlaybackByEntryRef.current)) {
        invoke("delete_file", { path }).catch(() => {});
      }
      tempPlaybackByEntryRef.current = {};
    },
    [],
  );

  const completed = history.filter((e) => e.status === "completed" && e.subtitles.length > 0);

  const handleSelect = useCallback(
    (entry: HistoryEntry) => {
      invoke("get_file_info", { path: entry.videoPath })
        .then(() => {
          if (blobRef.current) {
            URL.revokeObjectURL(blobRef.current);
            blobRef.current = "";
          }
          // 切换视频前停止上一个 HLS session
          if (hlsSessionRef.current) {
            hlsSessionRef.current.stop().catch(() => {});
            hlsSessionRef.current = null;
          }
          setActiveEntry(entry);
          const compatPath = tempPlaybackByEntryRef.current[getEntryKey(entry)];
          setPlaybackPath(compatPath || entry.videoPath);
          setHlsUrl(""); // 先尝试 direct，由 video error 触发 HLS 回退
          setVttBlobUrl("");
          setLoadError("");
          setCompatProgress("");
          setMakingCompatCopy(false);
          setHlsLoading(false);

          const vtt = itemsToVtt(entry.subtitles);
          const blob = new Blob([vtt], { type: "text/vtt" });
          const url = URL.createObjectURL(blob);
          blobRef.current = url;
          setVttBlobUrl(url);
        })
        .catch(() => {
          showMessage({
            type: "error",
            title: "视频文件已丢失",
            description: "原文件已被移动或删除，无法播放。",
          });
        });
    },
    [getEntryKey],
  );

  /**
   * direct 播放失败时回退到 HLS 转码。
   * 由 VideoPlayer 的 video error（code 4 等）触发。
   */
  const handlePlaybackError = useCallback(
    async (msg: string) => {
      // 已经在 HLS 模式下还失败 → 不再重试，交给兼容副本兜底
      if (hlsSessionRef.current) {
        stopActiveHlsSession();
        setLoadError(msg);
        return;
      }

      // direct 失败 → 尝试 HLS 转码
      if (!activeEntry) {
        setLoadError(msg);
        return;
      }
      setHlsLoading(true);
      setLoadError("");
      try {
        const session = await startHlsSession({
          inputPath: activeEntry.videoPath,
          strategy: "transcode",
        });
        hlsSessionRef.current = session;
        setHlsUrl(session.playlistUrl);
      } catch (err) {
        setLoadError(
          `无法启动实时转码: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setHlsLoading(false);
      }
    },
    [activeEntry, stopActiveHlsSession],
  );

  const handleClearError = useCallback(() => setLoadError(""), []);

  const handleMakeCompatibleCopy = useCallback(async () => {
    if (!activeEntry || makingCompatCopy) return;
    const entryKey = getEntryKey(activeEntry);
    const existingPath = tempPlaybackByEntryRef.current[entryKey];
    if (existingPath) {
      // 切到兼容副本前先停 HLS
      stopActiveHlsSession();
      setPlaybackPath(existingPath);
      setCompatProgress("");
      setLoadError("");
      return;
    }

    setMakingCompatCopy(true);
    setCompatProgress("准备生成兼容副本...");
    setLoadError("");

    try {
      const outputPath = (await invoke("create_temp_media_path", { ext: "mp4" })) as string;
      const ok = await runMakePlayableCopy(activeEntry.videoPath, outputPath, setCompatProgress);
      if (!ok) {
        await invoke("delete_file", { path: outputPath }).catch(() => {});
        setLoadError("无法生成兼容副本。这个视频可能使用了当前 WebView 不支持的编码。");
        return;
      }

      tempPlaybackByEntryRef.current[entryKey] = outputPath;
      stopActiveHlsSession();
      setPlaybackPath(outputPath);
      setCompatProgress("");
      setLoadError("");
    } catch (err) {
      setLoadError(`生成兼容副本失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMakingCompatCopy(false);
    }
  }, [activeEntry, getEntryKey, makingCompatCopy, stopActiveHlsSession]);

  const handleDeleteCompatibleCopy = useCallback(async () => {
    if (!activeEntry) return;
    const entryKey = getEntryKey(activeEntry);
    const compatPath = tempPlaybackByEntryRef.current[entryKey];
    if (!compatPath) return;

    await invoke("delete_file", { path: compatPath }).catch(() => {});
    delete tempPlaybackByEntryRef.current[entryKey];
    setPlaybackPath(activeEntry.videoPath);
    setCompatProgress("");
    setLoadError("兼容副本已删除，当前视频将尝试使用原文件播放。");
  }, [activeEntry, getEntryKey]);

  const isUnsupportedMediaError = loadError.includes("code 4") || loadError.includes("HLS");
  const sourceExt = activeEntry?.videoName.split(".").pop()?.toLowerCase() || "";
  const activeCompatPath = activeEntry
    ? tempPlaybackByEntryRef.current[getEntryKey(activeEntry)] || ""
    : "";
  const compatHint =
    sourceExt === "mkv"
      ? "当前播放器基于系统 WebView，MKV/HEVC 10bit 常会触发 code 4。已尝试实时 HLS 转码，若仍失败可生成完整兼容副本。"
      : "当前系统 WebView 无法直接解码这个文件，已尝试实时 HLS 转码，若仍失败可生成完整兼容副本。";

  return (
    <div className="flex h-full">
      <VideoSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        completed={completed}
        activeEntry={activeEntry}
        onSelect={handleSelect}
      />

      <div className={`flex-1 flex flex-col min-w-0 ${activeEntry ? "bg-black" : "bg-app-bg"}`}>
        {activeEntry ? (
          loadError ? (
            <div className="flex-1 flex items-center justify-center min-h-[300px]">
              <div className="text-center p-6 max-w-md">
                <Icon name="close" className="w-8 h-8 text-app-error mx-auto mb-3" />
                <p className="text-app-error text-sm">{loadError}</p>
                {isUnsupportedMediaError && (
                  <>
                    <p className="text-app-text-tertiary text-xs mt-2">{compatHint}</p>
                    <button
                      type="button"
                      onClick={handleMakeCompatibleCopy}
                      disabled={makingCompatCopy}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-app-accent text-white text-xs font-medium disabled:opacity-60"
                    >
                      <Icon
                        name={makingCompatCopy ? "spinner" : "video"}
                        className={`w-4 h-4 ${makingCompatCopy ? "animate-spin" : ""}`}
                      />
                      {makingCompatCopy
                        ? "处理中..."
                        : activeCompatPath
                          ? "使用兼容副本"
                          : "生成兼容副本"}
                    </button>
                    {activeCompatPath && (
                      <button
                        type="button"
                        onClick={handleDeleteCompatibleCopy}
                        disabled={makingCompatCopy}
                        className="mt-4 ml-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-app-surface text-app-text-secondary text-xs font-medium ring-1 ring-app-border disabled:opacity-60"
                      >
                        删除兼容副本
                      </button>
                    )}
                  </>
                )}
                {compatProgress && (
                  <p className="text-app-text-tertiary text-xs mt-3">{compatProgress}</p>
                )}
                <p className="text-app-text-tertiary text-xs mt-2 truncate max-w-sm">
                  {activeEntry.videoPath}
                </p>
              </div>
            </div>
          ) : (
            <VideoPlayer
              entry={activeEntry}
              sourcePath={playbackPath}
              hlsUrl={hlsUrl}
              compatCopyPath={activeCompatPath}
              vttBlobUrl={vttBlobUrl}
              onError={handlePlaybackError}
              onClearError={handleClearError}
              onDeleteCompatCopy={handleDeleteCompatibleCopy}
            />
          )
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-xs">
              <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-app-surface ring-1 ring-app-border flex items-center justify-center">
                <Icon name="player" className="w-7 h-7 text-app-text-tertiary" />
              </div>
              <h2 className="text-lg font-medium text-app-text-secondary mb-1">选择视频</h2>
              <p className="text-sm text-app-text-tertiary">从左侧列表选择已翻译的视频开始播放</p>
            </div>
          </div>
        )}
        {hlsLoading && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/70 text-white text-xs flex items-center gap-2">
            <Icon name="spinner" className="w-4 h-4 animate-spin" />
            正在启动实时转码...
          </div>
        )}
      </div>
    </div>
  );
}
