import Icon from "@/components/Icon";
import type { HistoryEntry } from "@/types";

type PlayerTab = "translated" | "local";

interface Props {
  activeTab: PlayerTab;
  onTabChange: (t: PlayerTab) => void;
  completed: HistoryEntry[];
  activeEntry: HistoryEntry | null;
  onSelect: (entry: HistoryEntry) => void;
}

export function TabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button onClick={onClick} className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${active ? "bg-app-surface text-app-text ring-1 ring-app-border" : "text-app-text-tertiary hover:text-app-text-secondary"}`}>
      {label}{count > 0 && <span className={`ml-1.5 text-[10px] ${active ? "text-app-text-tertiary" : "text-app-text-tertiary/60"}`}>{count}</span>}
    </button>
  );
}

function ListItem({ entry, active, onClick }: { entry: HistoryEntry; active: boolean; onClick: () => void }) {
  const date = new Date(entry.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <button onClick={onClick} className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200 mb-0.5 ${active ? "bg-app-surface ring-1 ring-app-border" : "hover:bg-app-surface-alt"}`}>
      <p className={`text-sm truncate font-medium ${active ? "text-app-text" : "text-app-text-secondary"}`}>{entry.videoName}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] text-app-text-tertiary">{date}</span>
        <span className="w-0.5 h-0.5 rounded-full bg-app-text-tertiary" />
        <span className="text-[10px] text-app-text-tertiary">{entry.sourceLang} → {entry.targetLang}</span>
        <span className="w-0.5 h-0.5 rounded-full bg-app-text-tertiary" />
        <span className="text-[10px] text-app-text-tertiary">{entry.subtitles.length} 条</span>
      </div>
    </button>
  );
}

function Empty({ icon, text, sub }: { icon: "history" | "player"; text: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <Icon name={icon} className="w-8 h-8 text-app-text-tertiary mb-3" />
      <p className="text-sm text-app-text-tertiary">{text}</p>
      <p className="text-xs text-app-text-tertiary/60 mt-1">{sub}</p>
    </div>
  );
}

export default function VideoSidebar({ activeTab, onTabChange, completed, activeEntry, onSelect }: Props) {
  return (
    <aside className="w-[280px] flex-shrink-0 border-r border-app-border-light flex flex-col bg-app-bg">
      <div className="flex gap-0 p-3 pb-0">
        <TabBtn active={activeTab === "translated"} onClick={() => onTabChange("translated")} label="已翻译" count={completed.length} />
        <TabBtn active={activeTab === "local"} onClick={() => onTabChange("local")} label="本地视频" count={0} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
        {activeTab === "translated" ? (
          completed.length === 0
            ? <Empty icon="history" text="暂无已翻译的视频" sub="完成翻译后自动出现在这里" />
            : completed.map((entry) => (
                <ListItem key={entry.id} entry={entry} active={activeEntry?.id === entry.id} onClick={() => onSelect(entry)} />
              ))
        ) : (
          <Empty icon="player" text="本地视频列表" sub="此功能即将推出" />
        )}
      </div>
    </aside>
  );
}
