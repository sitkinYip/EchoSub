import React, { useState, useRef, useCallback } from "react";
import type { SubtitleItem } from "../types";

interface SubtitlePreviewProps {
  items: SubtitleItem[];
  onUpdateText: (index: number, newText: string) => void;
}

const SubtitlePreview: React.FC<SubtitlePreviewProps> = ({
  items,
  onUpdateText,
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = useCallback((item: SubtitleItem) => {
    setEditingIndex(item.index);
    setEditText(item.text);
    // Focus input after render
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSave = useCallback(
    (index: number) => {
      if (editText.trim()) {
        onUpdateText(index, editText.trim());
      }
      setEditingIndex(null);
    },
    [editText, onUpdateText]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === "Enter") {
        handleSave(index);
      } else if (e.key === "Escape") {
        setEditingIndex(null);
      }
    },
    [handleSave]
  );

  if (items.length === 0) {
    return (
      <div className="bg-gray-900/30 rounded-2xl border border-gray-800 p-6">
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <svg
            className="w-12 h-12 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
            />
          </svg>
          <p className="text-sm">字幕将在此显示</p>
          <p className="text-xs text-gray-600 mt-1">
            处理完成后可双击修改错别字
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/30 rounded-2xl border border-gray-800 overflow-hidden">
      {/* 表头 */}
      <div className="flex items-center px-4 py-3 border-b border-gray-800 bg-gray-900/50">
        <span className="w-10 text-xs text-gray-500 font-medium">#</span>
        <span className="w-48 text-xs text-gray-500 font-medium">时间轴</span>
        <span className="flex-1 text-xs text-gray-500 font-medium">字幕内容（双击编辑）</span>
      </div>

      {/* 列表 */}
      <div className="divide-y divide-gray-800/50 max-h-[400px] overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.index}
            className="flex items-center px-4 py-2.5 hover:bg-gray-800/30 transition-colors group"
          >
            {/* 序号 */}
            <span className="w-10 text-xs text-gray-500 font-mono">
              {item.index}
            </span>

            {/* 时间戳 */}
            <span className="w-48 text-xs text-gray-400 font-mono">
              {item.start} → {item.end}
            </span>

            {/* 字幕文本（可编辑） */}
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onDoubleClick={() => handleDoubleClick(item)}
            >
              {editingIndex === item.index ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={() => handleSave(item.index)}
                  onKeyDown={(e) => handleKeyDown(e, item.index)}
                  className="w-full px-2 py-1 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-gray-100 outline-none"
                />
              ) : (
                <p className="text-sm text-gray-200 truncate group-hover:text-gray-100">
                  {item.text}
                </p>
              )}
            </div>

            {/* 编辑提示 */}
            {editingIndex !== item.index && (
              <span className="ml-2 text-[10px] text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                双击编辑
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 统计信息 */}
      <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-900/50">
        <p className="text-xs text-gray-500">
          共 <span className="text-gray-300 font-medium">{items.length}</span>{" "}
          条字幕 · 双击任意字幕进行编辑
        </p>
      </div>
    </div>
  );
};

export default SubtitlePreview;
