import Icon from "@/components/Icon";
import { useState, useEffect } from "react";
import { useMessageStore } from "@/stores/messageStore";
import { MESSAGE_ICONS, MESSAGE_BG, MESSAGE_TEXT, MESSAGE_ICON_BG } from "@/config/messages";

export default function ToastRenderer() {
  const toasts = useMessageStore((s) => s.toasts);
  const dismiss = useMessageStore((s) => s.dismiss);
  if (!toasts.length) return null;

  return (
    <div className="fixed top-6 right-6 z-[100] flex flex-col-reverse gap-2.5 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} entry={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ entry, onDismiss }: { entry: { id: string; config: any; leaving: boolean }; onDismiss: () => void }) {
  const { type, title, description } = entry.config;
  const [anim, setAnim] = useState("enter");

  useEffect(() => {
    requestAnimationFrame(() => setAnim("active"));
  }, []);

  useEffect(() => {
    if (entry.leaving && anim === "active") setAnim("exit");
  }, [entry.leaving, anim]);

  return (
    <div
      onClick={onDismiss}
      className={`pointer-events-auto cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
        ${anim === "active" ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"}
      `}
    >
      <div className={`flex items-start gap-3 px-4 py-3 rounded-2xl ring-1 backdrop-blur-xl min-w-[280px] max-w-[360px]
        ${MESSAGE_BG[type as keyof typeof MESSAGE_BG]}`}
      >
        {/* Icon roundel */}
        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${MESSAGE_ICON_BG[type as keyof typeof MESSAGE_ICON_BG]}`}>
          <Icon name={MESSAGE_ICONS[type as keyof typeof MESSAGE_ICONS]} className={`w-3.5 h-3.5 ${MESSAGE_TEXT[type as keyof typeof MESSAGE_TEXT]}`} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 pt-0.5">
          <p className={`text-sm font-medium leading-tight ${MESSAGE_TEXT[type as keyof typeof MESSAGE_TEXT]}`}>{title}</p>
          {description && <p className="text-xs text-app-text-tertiary mt-0.5 leading-relaxed">{description}</p>}
        </div>

        {/* Manual dismiss */}
        <button onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="flex-shrink-0 w-5 h-5 rounded-md hover:bg-app-hover flex items-center justify-center transition-colors mt-0.5">
          <Icon name="close" className="w-3 h-3 text-app-text-tertiary" />
        </button>
      </div>
    </div>
  );
}
