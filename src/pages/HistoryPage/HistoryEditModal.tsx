import { useState, useCallback } from "react";
import SubtitlePreview from "@/components/SubtitlePreview";
import { useHistoryStore } from "@/stores/historyStore";
import type { ModalContentProps } from "@/config/modals";
import type { SubtitleItem, Language } from "@/types";

interface EditData {
  historyId: string;
  title: string;
  sourceLang: Language;
  targetLang: Language;
}

export default function HistoryEditModal({ close, data }: ModalContentProps<EditData>) {
  const entry = useHistoryStore((s) => s.history.find((e) => e.id === data.historyId));
  const updateSubtitles = useHistoryStore((s) => s.updateSubtitles);
  const [items, setItems] = useState<SubtitleItem[]>(() =>
    (entry?.subtitles ?? []).map((s) => ({ ...s })),
  );
  const [saving, setSaving] = useState(false);

  if (!entry) {
    return (
      <div className="flex flex-col items-center py-8">
        <p className="text-app-text-secondary text-sm">该历史记录已被删除</p>
        <button
          onClick={close}
          className="mt-4 px-4 py-2 rounded-xl bg-app-btn text-app-text text-sm"
        >
          关闭
        </button>
      </div>
    );
  }

  const handleUpdate = useCallback((index: number, newText: string) => {
    setItems((prev) =>
      prev.map((item) => (item.index === index ? { ...item, text: newText } : item)),
    );
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await updateSubtitles(data.historyId, items);
    setSaving(false);
    close();
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 mb-4 pr-8">
        <h2 className="text-base font-semibold text-app-text">编辑字幕</h2>
        <p className="text-xs text-app-text-tertiary mt-0.5 truncate">
          {data.title} · {data.sourceLang} → {data.targetLang}
        </p>
      </div>

      {/* Editor - scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <SubtitlePreview items={items} onUpdateText={handleUpdate} />
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 flex gap-3 pt-4 mt-3 border-t border-app-border-light">
        <button
          onClick={close}
          className="flex-1 px-4 py-2.5 rounded-xl bg-app-surface hover:bg-app-hover text-app-text-secondary transition-all text-sm font-medium active:scale-[0.98]"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 px-4 py-2.5 rounded-xl bg-app-btn hover:bg-app-btn-hover disabled:bg-app-surface disabled:text-app-text-tertiary text-app-text transition-all text-sm font-medium active:scale-[0.98]"
        >
          {saving ? "保存中..." : "保存修改"}
        </button>
      </div>
    </div>
  );
}
