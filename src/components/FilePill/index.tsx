import Icon from "@/components/Icon";

interface Props {
  name: string;
  sourceLang: string;
  targetLang: string;
  mode: string;
  onReset: () => void;
  status?: {
    label: string;
    count?: string;
    progressPercent: number;
    tone: "active" | "error" | "complete";
  };
}

const statusTextClass = {
  active: "text-app-text-secondary",
  error: "text-app-error",
  complete: "text-app-success",
};

const progressClass = {
  active: "bg-app-accent",
  error: "bg-app-error",
  complete: "bg-app-success",
};

export default function FilePill({ name, sourceLang, targetLang, mode, onReset, status }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-app-surface ring-1 ring-app-border">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-app-accent-bg ring-1 ring-app-accent-ring">
          <Icon name="video" className="h-4 w-4 text-app-accent" />
        </div>
        <span className="min-w-0 flex-1 truncate text-sm text-app-text">{name}</span>
        <span className="hidden flex-shrink-0 text-xs text-app-text-tertiary sm:block">
          {sourceLang} → {targetLang} · {mode}
        </span>
        <button
          onClick={onReset}
          className="flex-shrink-0 text-xs text-app-text-tertiary transition-colors hover:text-app-text-secondary"
        >
          重新选择
        </button>
      </div>

      {status && (
        <>
          <div className="flex min-h-9 items-center justify-between gap-4 border-t border-app-border-light px-4 py-2">
            <p className={`min-w-0 truncate text-xs font-medium ${statusTextClass[status.tone]}`}>
              {status.label}
            </p>
            {status.count && (
              <span className="flex-shrink-0 text-[11px] tabular-nums text-app-text-tertiary">
                {status.count}
              </span>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-app-border-light">
            <div
              className={`h-full transition-[width,background-color] duration-500 ease-out ${progressClass[status.tone]}`}
              style={{ width: `${status.progressPercent}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}
