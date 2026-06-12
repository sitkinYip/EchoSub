import Icon from "@/components/Icon";

interface Props { name: string; sourceLang: string; targetLang: string; mode: string; onReset: () => void; }

export default function FilePill({ name, sourceLang, targetLang, mode, onReset }: Props) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-app-surface ring-1 ring-app-border">
      <div className="w-8 h-8 rounded-xl bg-app-accent-bg ring-1 ring-app-accent-ring flex items-center justify-center">
        <Icon name="video" className="w-4 h-4 text-app-accent" />
      </div>
      <span className="text-sm text-app-text flex-1 truncate">{name}</span>
      <span className="text-xs text-app-text-tertiary">{sourceLang} → {targetLang} · {mode}</span>
      <button onClick={onReset} className="text-xs text-app-text-tertiary hover:text-app-text-secondary transition-colors">重新选择</button>
    </div>
  );
}
