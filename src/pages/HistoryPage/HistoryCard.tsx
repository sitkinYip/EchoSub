import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { showModal } from "@/components/Modal/create";
import { showMessage } from "@/components/Toast/create";
import CardActionBtn from "@/components/CardActionBtn";
import { useTranslationStore } from "@/stores/translationStore";
import { itemsToSrt } from "@/utils/srtParser";
import type { HistoryEntry, Language } from "@/types";

interface Props {
  entry: HistoryEntry;
  onDelete: () => void;
}

export default function HistoryCard({ entry, onDelete }: Props) {
  const navigate = useNavigate();
  const { setRegenerate } = useTranslationStore();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { id, videoName, sourceLang, targetLang, mode, status, subtitles, createdAt, videoPath } =
    entry;
  const date = new Date(createdAt).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleEdit = () => {
    showModal("HistoryEdit", { historyId: id, title: videoName, sourceLang, targetLang });
  };

  const handleExport = async () => {
    if (!subtitles.length) return;
    const dn = videoName.replace(/\.[^.]+$/, "") + "_subtitle.srt";
    const fp = await saveDialog({
      defaultPath: dn,
      filters: [{ name: "SRT 字幕文件", extensions: ["srt"] }],
    });
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
    let exists: boolean;
    try {
      await invoke("get_file_info", { path: videoPath });
      exists = true;
    } catch {
      exists = false;
    }

    showModal("RegenerateConfirm", {
      videoName,
      videoPath,
      exists,
      sourceLang,
      targetLang,
      uploadVideo: mode === "video",
      onConfirm: (src: Language, tgt: Language, uv: boolean) => {
        setRegenerate({ videoPath, videoName, sourceLang: src, targetLang: tgt, uploadVideo: uv });
        navigate("/");
      },
    });
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete();
  };

  return (
    <div
      className="group rounded-2xl bg-app-surface-alt ring-1 ring-app-border-light hover:ring-app-border transition-all duration-300"
      onMouseLeave={() => setConfirmDelete(false)}
    >
      <div className="flex items-center gap-3 px-5 py-3">
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${status === "completed" ? "bg-app-success" : "bg-app-error"}`}
        />
        <span className="text-sm text-app-text font-medium truncate flex-1 min-w-0">
          {videoName}
        </span>
        <span className="text-xs text-app-text-tertiary flex-shrink-0">{date}</span>
      </div>

      <div className="flex items-center gap-3 px-5 pb-3">
        <span className="text-[11px] text-app-text-tertiary">
          {sourceLang} → {targetLang}
        </span>
        <span className="w-0.5 h-0.5 rounded-full bg-app-text-tertiary" />
        <span className="text-[11px] text-app-text-tertiary">
          {mode === "video" ? "视频模式" : "音频模式"}
        </span>
        <span className="w-0.5 h-0.5 rounded-full bg-app-text-tertiary" />
        <span className="text-[11px] text-app-text-tertiary">{subtitles.length} 条字幕</span>
        {status === "error" && (
          <>
            <span className="w-0.5 h-0.5 rounded-full bg-app-text-tertiary" />
            <span className="text-[11px] text-app-error truncate">{entry.error || "翻译失败"}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1 px-3 pb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <CardActionBtn
          label="编辑"
          icon="translate"
          onClick={handleEdit}
          disabled={!subtitles.length}
        />
        <CardActionBtn
          label="导出"
          icon="download"
          onClick={handleExport}
          disabled={!subtitles.length}
        />
        <CardActionBtn label="目录" icon="video" onClick={handleOpenFolder} />
        <CardActionBtn label="重新生成" icon="spinner" onClick={handleRegenerate} />
        <CardActionBtn
          label={confirmDelete ? "确认删除" : "删除"}
          icon="close"
          onClick={handleDelete}
          danger
        />
      </div>
    </div>
  );
}
