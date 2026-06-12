import React, { useCallback, useRef, useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Icon from "@/components/Icon";
import { SUPPORTED_VIDEO_EXTS } from "@/config";

interface Props { onFileSelect: (filePath: string, fileName: string) => void; disabled?: boolean; }

export default function DropZone({ onFileSelect, disabled }: Props) {
  const [drag, setDrag] = useState(false);
  const ref = useRef(onFileSelect); ref.current = onFileSelect;

  useEffect(() => {
    let cancelled = false; let clean: (() => void) | null = null;
    (async () => {
      try {
        const raw = getCurrentWindow(); const win = raw instanceof Promise ? await raw : raw;
        if (cancelled) return;
        const un = await (win as any).onDragDropEvent((e: any) => {
          if (disabled) return;
          switch (e.payload.type) {
            case "enter": case "over": setDrag(true); break;
            case "leave": setDrag(false); break;
            case "drop": { setDrag(false); const p = e.payload.paths; if (p?.length) ref.current(p[0], p[0].split(/[/\\]/).pop() || p[0]); break; }
          }
        });
        if (!cancelled) clean = un; else un();
      } catch (err) { console.error("拖拽监听失败:", err); }
    })();
    return () => { cancelled = true; clean?.(); };
  }, [disabled]);

  const click = useCallback(async () => {
    if (disabled) return;
    const sel = await open({ multiple: false, filters: [{ name: "视频文件", extensions: SUPPORTED_VIDEO_EXTS }] });
    if (sel && typeof sel === "string") onFileSelect(sel, sel.split(/[/\\]/).pop() || sel);
  }, [disabled, onFileSelect]);

  return (
    <button onClick={click} disabled={disabled} className="relative w-full group">
      <div className={`relative flex flex-col items-center justify-center rounded-3xl border transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] min-h-[300px] px-8 py-12
        ${disabled ? "border-app-border-light bg-app-surface-alt cursor-not-allowed opacity-40"
          : drag ? "border-app-accent/40 bg-app-accent-bg scale-[1.01]" : "border-app-border-light bg-app-surface-alt hover:border-app-border hover:bg-app-surface"}`}>
        <div className={`mb-5 w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 ring-1 ${drag ? "bg-app-accent-bg ring-app-accent-ring scale-110" : "bg-app-surface ring-app-border-light group-hover:bg-app-hover"}`}>
          <Icon name="upload" className={`w-7 h-7 transition-colors duration-300 ${drag ? "text-app-accent" : "text-app-text-tertiary group-hover:text-app-text-secondary"}`} />
        </div>
        <p className="text-base font-medium text-app-text-secondary mb-1 tracking-tight">{drag ? "释放以导入" : "拖拽视频文件到此处"}</p>
        <p className="text-sm text-app-text-tertiary mb-6">或点击选择文件</p>
        <div className="flex flex-wrap justify-center gap-2">
          {["MP4", "MKV", "MOV", "AVI"].map((e) => (<span key={e} className="px-3 py-1 text-[11px] font-medium bg-app-surface text-app-text-tertiary rounded-lg ring-1 ring-app-border-light">{e}</span>))}
        </div>
        {/* Corner decorations */}
        <div className="absolute top-4 left-4 w-6 h-px bg-app-hover" /><div className="absolute top-4 left-4 w-px h-6 bg-app-hover" />
        <div className="absolute top-4 right-4 w-6 h-px bg-app-hover" /><div className="absolute top-4 right-4 w-px h-6 bg-app-hover" />
        <div className="absolute bottom-4 left-4 w-6 h-px bg-app-hover" /><div className="absolute bottom-4 left-4 w-px h-6 bg-app-hover" />
        <div className="absolute bottom-4 right-4 w-6 h-px bg-app-hover" /><div className="absolute bottom-4 right-4 w-px h-6 bg-app-hover" />
      </div>
    </button>
  );
}
