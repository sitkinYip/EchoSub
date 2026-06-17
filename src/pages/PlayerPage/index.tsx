import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import Icon from "@/components/Icon";
import { showMessage } from "@/components/Toast/create";
import { runMakePlayableCopy } from "@/services/ffmpegService";
import { useHistoryStore } from "@/stores/historyStore";
import { itemsToVtt } from "@/utils/srtParser";
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
  const [loadError, setLoadError] = useState("");
  const [compatProgress, setCompatProgress] = useState("");
  const [makingCompatCopy, setMakingCompatCopy] = useState(false);
  const tempPlaybackByEntryRef = useRef<Record<string, string>>({});
  const blobRef = useRef("");

  const getEntryKey = useCallback((entry: HistoryEntry) => `${entry.id}:${entry.videoPath}`, []);

  useEffect(() => {
    if (!historyLoaded) load();
  }, []);
  useEffect(
    () => () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
      for (const path of Object.values(tempPlaybackByEntryRef.current)) {
        invoke("delete_file", { path }).catch(() => {});
      }
      tempPlaybackByEntryRef.current = {};
    },
    [],
  );

  const completed = history.filter((e) => e.status === "completed" && e.subtitles.length > 0);

  const handleSelect = useCallback((entry: HistoryEntry) => {
    invoke("get_file_info", { path: entry.videoPath })
      .then(() => {
        if (blobRef.current) {
          URL.revokeObjectURL(blobRef.current);
          blobRef.current = "";
        }
        setActiveEntry(entry);
        const compatPath = tempPlaybackByEntryRef.current[getEntryKey(entry)];
        setPlaybackPath(compatPath || entry.videoPath);
        setVttBlobUrl("");
        setLoadError("");
        setCompatProgress("");
        setMakingCompatCopy(false);

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
  }, [getEntryKey]);

  const handleMakeCompatibleCopy = useCallback(async () => {
    if (!activeEntry || makingCompatCopy) return;
    const entryKey = getEntryKey(activeEntry);
    const existingPath = tempPlaybackByEntryRef.current[entryKey];
    if (existingPath) {
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
      setPlaybackPath(outputPath);
      setCompatProgress("");
      setLoadError("");
    } catch (err) {
      setLoadError(`生成兼容副本失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMakingCompatCopy(false);
    }
  }, [activeEntry, getEntryKey, makingCompatCopy]);

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

  const isUnsupportedMediaError = loadError.includes("code 4");
  const sourceExt = activeEntry?.videoName.split(".").pop()?.toLowerCase() || "";
  const activeCompatPath = activeEntry
    ? tempPlaybackByEntryRef.current[getEntryKey(activeEntry)] || ""
    : "";
  const compatHint =
    sourceExt === "mkv"
      ? "当前播放器基于系统 WebView，MKV/HEVC 10bit 常会触发 code 4。外部播放器能播不代表 WebView 能直接解码。"
      : "当前系统 WebView 无法直接解码这个文件，生成 MP4 兼容副本后通常可以播放。";

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
              compatCopyPath={activeCompatPath}
              vttBlobUrl={vttBlobUrl}
              onError={setLoadError}
              onClearError={() => setLoadError("")}
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
      </div>
    </div>
  );
}
