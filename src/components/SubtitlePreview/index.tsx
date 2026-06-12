import React, { useState, useRef, useCallback } from "react";
import Icon from "@/components/Icon";
import type { SubtitleItem } from "@/types";

interface Props { items: SubtitleItem[]; onUpdateText: (index: number, newText: string) => void; }

export default function SubtitlePreview({ items, onUpdateText }: Props) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const doubleClick = useCallback((item: SubtitleItem) => { setEditIdx(item.index); setEditText(item.text); setTimeout(() => inputRef.current?.focus(), 50); }, []);
  const save = useCallback((idx: number) => { if (editText.trim()) onUpdateText(idx, editText.trim()); setEditIdx(null); }, [editText, onUpdateText]);
  const keyDown = useCallback((e: React.KeyboardEvent, idx: number) => { if (e.key === "Enter") save(idx); else if (e.key === "Escape") setEditIdx(null); }, [save]);

  if (!items.length) return (
    <div className="rounded-2xl bg-app-surface-alt ring-1 ring-app-border p-8">
      <div className="flex flex-col items-center justify-center py-12 text-app-text-tertiary">
        <Icon name="chat" className="w-12 h-12 mb-3" />
        <p className="text-sm">字幕将在此显示</p>
        <p className="text-xs text-app-text-tertiary mt-1">处理完成后可双击修改错别字</p>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl bg-app-surface-alt ring-1 ring-app-border overflow-hidden">
      <div className="flex items-center px-5 py-3 border-b border-app-border-light bg-app-surface-alt">
        <span className="w-8 text-[11px] text-app-text-tertiary font-medium">#</span>
        <span className="w-44 text-[11px] text-app-text-tertiary font-medium">时间轴</span>
        <span className="flex-1 text-[11px] text-app-text-tertiary font-medium">字幕内容</span>
      </div>
      <div className="divide-y divide-app-border-light max-h-[420px] overflow-y-auto">
        {items.map((item, i) => (
          <div key={`${item.index}-${item.start}-${i}`} className="flex items-center px-5 py-2.5 hover:bg-app-surface transition-colors group">
            <span className="w-8 text-xs text-app-text-tertiary font-mono">{item.index}</span>
            <span className="w-44 text-xs text-app-text-tertiary font-mono tabular-nums">{item.start} → {item.end}</span>
            <div className="flex-1 min-w-0 cursor-pointer" onDoubleClick={() => doubleClick(item)}>
              {editIdx === item.index ? (
                <input ref={inputRef} type="text" value={editText} onChange={(e) => setEditText(e.target.value)} onBlur={() => save(item.index)} onKeyDown={(e) => keyDown(e, item.index)}
                  className="w-full px-2.5 py-1 bg-app-accent-bg ring-1 ring-app-accent-ring rounded-lg text-sm text-app-text outline-none transition-all" />
              ) : (
                <p className="text-sm text-app-text-secondary truncate group-hover:text-app-text transition-colors">{item.text}</p>
              )}
            </div>
            {editIdx !== item.index && <span className="ml-2 text-[10px] text-app-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">双击编辑</span>}
          </div>
        ))}
      </div>
      <div className="px-5 py-2.5 border-t border-app-border-light bg-app-surface-alt">
        <p className="text-xs text-app-text-tertiary">共 <span className="text-app-text-secondary font-medium">{items.length}</span> 条字幕 · 双击编辑</p>
      </div>
    </div>
  );
}
