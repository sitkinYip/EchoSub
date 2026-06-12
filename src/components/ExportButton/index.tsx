import React from "react"; import Icon from "@/components/Icon";
import type { SubtitleItem } from "@/types";
import { itemsToSrt } from "@/utils/srtParser";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

interface Props { items: SubtitleItem[]; disabled?: boolean; videoFileName?: string; }

export default function ExportButton({ items, disabled, videoFileName }: Props) {
  const export_ = async () => {
    if (!items.length) return;
    const dn = videoFileName ? videoFileName.replace(/\.[^.]+$/, "") + "_subtitle.srt" : "subtitle.srt";
    const fp = await save({ defaultPath: dn, filters: [{ name: "SRT 字幕文件", extensions: ["srt"] }] });
    if (!fp) return;
    await writeTextFile(fp, itemsToSrt(items));
  };

  return (
    <button onClick={export_} disabled={disabled || !items.length}
      className="group relative flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-app-btn hover:bg-app-btn-hover disabled:bg-app-surface disabled:text-app-text-tertiary text-app-text disabled:cursor-not-allowed transition-all duration-300 text-sm font-medium active:scale-[0.97]">
      <Icon name="download" className="w-4 h-4" />
      导出 SRT
      <span className="w-6 h-6 rounded-full bg-app-surface flex items-center justify-center group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300">
        <Icon name="arrow-right" className="w-3 h-3 text-app-text-secondary" />
      </span>
    </button>
  );
}
