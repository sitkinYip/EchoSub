import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import Icon from "@/components/Icon";
import { showModal } from "@/components/Modal/create";
import { showMessage } from "@/components/Toast/create";
import { useTranslationStore } from "@/stores/translationStore";
import { itemsToSrt } from "@/utils/srtParser";
import type { HistoryEntry } from "@/types";

interface Props { entry: HistoryEntry; onDelete: () => void; }

export default function HistoryCard({ entry, onDelete }: Props) {
  const navigate = useNavigate();
  const { setRegenerate } = useTranslationStore();

  const { id, videoName, sourceLang, targetLang, mode, status, subtitles, createdAt, videoPath } = entry;
  const date = new Date(createdAt).toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });

  const handleEdit = () => {
    showModal("HistoryEdit", { historyId: id, title: videoName, sourceLang, targetLang });
  };

  const handleExport = async () => {
    if (!subtitles.length) return;
    const dn = videoName.replace(/\.[^.]+$/, "") + "_subtitle.srt";
    const fp = await saveDialog({ defaultPath: dn, filters: [{ name: "SRT 字幕文件", extensions: ["srt"] }] });
    if (!fp) return;
    await writeTextFile(fp, itemsToSrt(subtitles));
  };

  const handleOpenFolder = async () => {
    if (!videoPath) {
      showMessage({ type: "warning", title: "无法打开目录", description: "路径记录为空" });
      return;
    }
    try {
      await invoke("reveal_in_folder", { path: videoPath });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showMessage({ type: "error", title: "无法打开目录", description: msg });
    }
  };

  const handleRegenerate = async () => {
    // Check if video file still exists
    let exists = false;
    try {
      await invoke("get_file_info", { path: videoPath });
      exists = true;
    } catch { exists = false; }

    showModal("RegenerateConfirm", {
      videoName,
      videoPath,
      exists,
      sourceLang,
      targetLang,
      uploadVideo: mode === "video",
      onConfirm: (src: string, tgt: string, uv: boolean) => {
        setRegenerate({ videoPath, videoName, sourceLang: src as any, targetLang: tgt as any, uploadVideo: uv });
        navigate("/");
      },
    });
  };

  return (
    <div className="group rounded-2xl bg-app-surface-alt ring-1 ring-app-border-light hover:ring-app-border transition-all duration-300">
      {/* Header row */}
      <div className="flex items-center gap-3 px-5 py-3">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status === "completed" ? "bg-app-success" : "bg-app-error"}`} />
        <span className="text-sm text-app-text font-medium truncate flex-1 min-w-0">{videoName}</span>
        <span className="text-xs text-app-text-tertiary flex-shrink-0">{date}</span>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 px-5 pb-3">
        <span className="text-[11px] text-app-text-tertiary">{sourceLang} → {targetLang}</span>
        <span className="w-0.5 h-0.5 rounded-full bg-app-text-tertiary" />
        <span className="text-[11px] text-app-text-tertiary">{mode === "video" ? "视频模式" : "音频模式"}</span>
        <span className="w-0.5 h-0.5 rounded-full bg-app-text-tertiary" />
        <span className="text-[11px] text-app-text-tertiary">{subtitles.length} 条字幕</span>
        {status === "error" && (
          <>
            <span className="w-0.5 h-0.5 rounded-full bg-app-text-tertiary" />
            <span className="text-[11px] text-app-error truncate">{entry.error || "翻译失败"}</span>
          </>
        )}
      </div>

      {/* Action row */}
      <div className="flex items-center gap-1 px-3 pb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <ActionBtn label="编辑" icon="translate" onClick={handleEdit} disabled={!subtitles.length} />
        <ActionBtn label="导出" icon="download" onClick={handleExport} disabled={!subtitles.length} />
        <ActionBtn label="目录" icon="video" onClick={handleOpenFolder} />
        <ActionBtn label="重新生成" icon="spinner" onClick={handleRegenerate} />
        <ActionBtn label="删除" icon="close" onClick={onDelete} danger />
      </div>
    </div>
  );
}

function ActionBtn({ label, icon, onClick, disabled, danger }: {
  label: string; icon: any; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 active:scale-95
        ${disabled ? "text-app-text-tertiary/40 cursor-not-allowed"
          : danger ? "text-app-error hover:bg-app-error-bg"
          : "text-app-text-secondary hover:text-app-text hover:bg-app-hover"}`}
    >
      <Icon name={icon} className="w-3 h-3" />
      {label}
    </button>
  );
}
