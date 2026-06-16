import { useEffect } from "react";
import { useHistoryStore } from "@/stores/historyStore";
import HistoryCard from "@/pages/HistoryPage/HistoryCard";

export default function HistoryPage() {
  const { history, historyLoaded, load, deleteEntry } = useHistoryStore();

  useEffect(() => { if (!historyLoaded) load(); }, []);

  if (!historyLoaded) return null;

  if (!history.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-app-surface-alt ring-1 ring-app-border-light flex items-center justify-center">
            <svg className="w-7 h-7 text-app-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-app-text-secondary mb-2">暂无翻译历史</h2>
          <p className="text-sm text-app-text-tertiary leading-relaxed">完成一次翻译后，记录将出现在这里。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-8">
        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-xl font-semibold text-app-text tracking-tight">翻译历史</h1>
          <span className="text-xs text-app-text-tertiary ml-auto">{history.length} 条记录</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-8">
        <div className="max-w-3xl mx-auto pb-24 space-y-3">
          {history.map((entry) => (
            <HistoryCard
              key={entry.id}
              entry={entry}
              onDelete={() => deleteEntry(entry.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
