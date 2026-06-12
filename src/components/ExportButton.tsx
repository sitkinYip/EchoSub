import React from "react";
import type { SubtitleItem } from "../types";
import { itemsToSrt } from "../utils/srtParser";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

interface ExportButtonProps {
  items: SubtitleItem[];
  disabled?: boolean;
  videoFileName?: string;
}

const ExportButton: React.FC<ExportButtonProps> = ({ items, disabled, videoFileName }) => {
  const handleExport = async () => {
    if (items.length === 0) return;

    // 根据视频文件名生成默认导出名：input.mp4 → input_subtitle.srt
    const defaultName = videoFileName
      ? videoFileName.replace(/\.[^.]+$/, "") + "_subtitle.srt"
      : "subtitle.srt";

    try {
      // 弹出保存对话框
      const filePath = await save({
        defaultPath: defaultName,
        filters: [
          {
            name: "SRT 字幕文件",
            extensions: ["srt"],
          },
        ],
      });

      if (!filePath) return; // 用户取消

      // 生成 SRT 内容并写入
      const srtContent = itemsToSrt(items);
      await writeTextFile(filePath, srtContent);

      console.log(`✅ 字幕已保存到: ${filePath}`);
    } catch (err) {
      console.error("保存失败:", err);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled || items.length === 0}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 text-white font-medium text-sm transition-all duration-200 disabled:cursor-not-allowed"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        />
      </svg>
      导出 SRT
    </button>
  );
};

export default ExportButton;
