import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import Icon from "@/components/Icon";
import { showMessage } from "@/components/Toast/create";
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
  const [loadError, setLoadError] = useState("");
  const blobRef = useRef("");

  useEffect(() => {
    if (!historyLoaded) load();
  }, []);
  useEffect(
    () => () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
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
        setVttBlobUrl("");
        setLoadError("");

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
  }, []);

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
              <div className="text-center p-6">
                <Icon name="close" className="w-8 h-8 text-app-error mx-auto mb-3" />
                <p className="text-app-error text-sm">{loadError}</p>
                <p className="text-app-text-tertiary text-xs mt-2 truncate max-w-sm">
                  {activeEntry.videoPath}
                </p>
              </div>
            </div>
          ) : (
            <VideoPlayer
              entry={activeEntry}
              vttBlobUrl={vttBlobUrl}
              onError={setLoadError}
              onClearError={() => setLoadError("")}
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
