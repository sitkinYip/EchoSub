import React, { useCallback, useRef, useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface DropZoneProps {
  onFileSelect: (filePath: string, fileName: string) => void;
  disabled?: boolean;
}

const SUPPORTED_EXTS = ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm"];

const DropZone: React.FC<DropZoneProps> = ({ onFileSelect, disabled }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const onFileSelectRef = useRef(onFileSelect);
  onFileSelectRef.current = onFileSelect;

  // --- Tauri native drag-drop listener ---
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      try {
        const raw = getCurrentWindow();
        const win = raw instanceof Promise ? await raw : raw;

        if (cancelled) return;

        const unlisten = await win.onDragDropEvent((event) => {
          if (disabled) return;

          switch (event.payload.type) {
            case "enter":
            case "over":
              setIsDragOver(true);
              break;
            case "leave":
              setIsDragOver(false);
              break;
            case "drop": {
              setIsDragOver(false);
              const paths = event.payload.paths;
              if (paths && paths.length > 0) {
                const filePath = paths[0];
                const fileName =
                  filePath.split(/[/\\]/).pop() || filePath;
                onFileSelectRef.current(filePath, fileName);
              }
              break;
            }
          }
        });

        if (!cancelled) {
          cleanup = unlisten;
        } else {
          unlisten();
        }
      } catch (err) {
        console.error("拖拽监听失败:", err);
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [disabled]);

  // --- Click to select file via OS dialog ---
  const handleClick = useCallback(async () => {
    if (disabled) return;
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "视频文件",
            extensions: SUPPORTED_EXTS,
          },
        ],
      });
      if (selected && typeof selected === "string") {
        const fileName = selected.split(/[/\\]/).pop() || selected;
        onFileSelect(selected, fileName);
      }
    } catch (err) {
      console.error("文件选择失败:", err);
    }
  }, [disabled, onFileSelect]);

  return (
    <div
      onClick={handleClick}
      className={`
        relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed
        transition-all duration-300 cursor-pointer min-h-[280px] px-6
        ${
          disabled
            ? "border-gray-800 bg-gray-900/50 cursor-not-allowed opacity-50"
            : isDragOver
            ? "border-blue-400 bg-blue-500/10 scale-[1.02]"
            : "border-gray-700 bg-gray-900/30 hover:border-gray-500 hover:bg-gray-900/50"
        }
      `}
    >
      <div
        className={`
        w-16 h-16 mb-4 rounded-2xl flex items-center justify-center transition-colors
        ${isDragOver ? "bg-blue-500/20" : "bg-gray-800"}
      `}
      >
        <svg
          className={`w-8 h-8 transition-colors ${
            isDragOver ? "text-blue-400" : "text-gray-500"
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
      </div>

      <p className="text-base font-medium text-gray-300 mb-1">
        拖拽视频文件到此处
      </p>
      <p className="text-sm text-gray-500 mb-4">或点击选择文件</p>

      <div className="flex flex-wrap justify-center gap-2">
        {["MP4", "MKV", "MOV", "AVI"].map((ext) => (
          <span
            key={ext}
            className="px-2.5 py-1 text-xs font-medium bg-gray-800 text-gray-400 rounded-lg"
          >
            {ext}
          </span>
        ))}
      </div>
    </div>
  );
};

export default DropZone;
