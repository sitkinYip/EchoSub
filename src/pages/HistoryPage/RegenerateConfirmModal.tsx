import React, { useState } from "react";
import Icon from "@/components/Icon";
import LangSelect from "@/components/LangSelect";
import { LANGUAGES } from "@/config";
import type { ModalContentProps } from "@/config/modals";

interface RegenerateData {
  videoName: string;
  videoPath: string;
  exists: boolean;
  sourceLang: string;
  targetLang: string;
  uploadVideo: boolean;
  onConfirm: (sourceLang: string, targetLang: string, uploadVideo: boolean) => void;
}

export default function RegenerateConfirmModal({ close, data }: ModalContentProps<RegenerateData>) {
  const [sourceLang, setSourceLang] = useState(data.sourceLang);
  const [targetLang, setTargetLang] = useState(data.targetLang);
  const [uploadVideo, setUploadVideo] = useState(data.uploadVideo);

  const handleConfirm = () => {
    data.onConfirm(sourceLang, targetLang, uploadVideo);
    close();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold text-app-text">重新生成字幕</h2>
      </div>

      <div className="space-y-5">
        {/* Video name */}
        <div className="px-3 py-2.5 bg-app-surface-alt rounded-xl ring-1 ring-app-border-light">
          <p className="text-sm text-app-text truncate font-medium">{data.videoName}</p>
        </div>

        {/* File existence check */}
        {!data.exists ? (
          <div className="p-3 rounded-xl bg-app-error-bg ring-1 ring-app-error-ring flex items-start gap-3">
            <Icon name="close" className="w-4 h-4 text-app-error flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-app-error font-medium">文件已丢失</p>
              <p className="text-xs text-app-text-tertiary mt-0.5">原视频文件已不存在或被移动，无法重新生成。</p>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-app-success-bg ring-1 ring-app-success-ring flex items-start gap-3">
            <Icon name="check" className="w-4 h-4 text-app-success flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-app-success font-medium">文件就绪</p>
              <p className="text-xs text-app-text-tertiary mt-0.5 truncate">{data.videoPath}</p>
            </div>
          </div>
        )}

        {/* Language selectors */}
        <div>
          <label className="block text-xs font-medium text-app-text-secondary mb-2 tracking-wide uppercase">翻译方向</label>
          <div className="flex items-center gap-2">
            <LangSelect value={sourceLang} onChange={setSourceLang} options={LANGUAGES} />
            <Icon name="chevron-right" className="w-3.5 h-3.5 text-app-text-tertiary flex-shrink-0" />
            <LangSelect value={targetLang} onChange={setTargetLang} options={LANGUAGES} />
          </div>
        </div>

        {/* Upload mode */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-app-surface-alt rounded-xl ring-1 ring-app-border-light">
          <div>
            <p className="text-sm text-app-text">直接上传原视频</p>
            <p className="text-xs text-app-text-tertiary mt-0.5">跳过音频提取，画面+语音混合识别</p>
          </div>
          <button
            onClick={() => setUploadVideo(!uploadVideo)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full flex-shrink-0 transition-colors ${uploadVideo ? "bg-app-accent" : "bg-app-hover"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${uploadVideo ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={close} className="flex-1 px-4 py-2.5 rounded-xl bg-app-surface hover:bg-app-hover text-app-text-secondary transition-all text-sm font-medium active:scale-[0.98]">
            取消
          </button>
          <button onClick={handleConfirm} disabled={!data.exists}
            className="flex-1 px-4 py-2.5 rounded-xl bg-app-btn hover:bg-app-btn-hover disabled:bg-app-surface disabled:text-app-text-tertiary text-app-text transition-all text-sm font-medium active:scale-[0.98] disabled:cursor-not-allowed">
            确认开始
          </button>
        </div>
      </div>
    </div>
  );
}
