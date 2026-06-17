import Icon from "@/components/Icon";
import type { ModalContentProps } from "@/config/modals";
import type { HistoryEntry } from "@/types";

interface DuplicateTranslationData {
  entry: HistoryEntry;
  onViewHistory: () => void;
  onRetranslate: () => void;
}

export default function DuplicateTranslationModal({
  close,
  data,
}: ModalContentProps<DuplicateTranslationData>) {
  const date = new Date(data.entry.createdAt).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleViewHistory = () => {
    data.onViewHistory();
    close();
  };

  const handleRetranslate = () => {
    data.onRetranslate();
    close();
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-app-accent-bg ring-1 ring-app-accent-ring flex items-center justify-center">
          <Icon name="history" className="w-4 h-4 text-app-accent" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-app-text">这个文件已翻译过</h2>
          <p className="text-xs text-app-text-tertiary mt-0.5">
            可以直接查看历史记录，或重新翻译并更新原记录。
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-app-surface-alt ring-1 ring-app-border-light px-3 py-2.5 mb-5">
        <p className="text-sm text-app-text truncate font-medium">{data.entry.videoName}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] text-app-text-tertiary">{date}</span>
          <span className="w-0.5 h-0.5 rounded-full bg-app-text-tertiary" />
          <span className="text-[11px] text-app-text-tertiary">
            {data.entry.sourceLang} → {data.entry.targetLang}
          </span>
          <span className="w-0.5 h-0.5 rounded-full bg-app-text-tertiary" />
          <span className="text-[11px] text-app-text-tertiary">
            {data.entry.mode === "video" ? "视频模式" : "音频模式"}
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleViewHistory}
          className="flex-1 px-4 py-2.5 rounded-xl bg-app-surface hover:bg-app-hover text-app-text-secondary transition-all text-sm font-medium active:scale-[0.98]"
        >
          去历史记录
        </button>
        <button
          onClick={handleRetranslate}
          className="flex-1 px-4 py-2.5 rounded-xl bg-app-btn hover:bg-app-btn-hover text-app-text transition-all text-sm font-medium active:scale-[0.98]"
        >
          重新翻译
        </button>
      </div>
    </div>
  );
}
