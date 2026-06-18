import Icon from "@/components/Icon";
import LangSelect from "@/components/LangSelect";
import Dropdown from "@/components/Dropdown";
import Switch from "@/components/Switch";
import { LANGUAGES } from "@/config";
import type { LanguageUpdate } from "../utils/types";
import type { Language } from "@/types";

type TranslateHeaderProps = {
  sourceLang: Language;
  targetLang: Language;
  uploadVideo: boolean;
  showUploadStrategy: boolean;
  hasApiKey: boolean;
  showReset: boolean;
  onUpdate: (patch: LanguageUpdate & { uploadVideo?: boolean }) => void;
  onSettingsClick: () => void;
  onReset: () => void;
};

export default function TranslateHeader({
  sourceLang,
  targetLang,
  uploadVideo,
  showUploadStrategy,
  hasApiKey,
  showReset,
  onUpdate,
  onSettingsClick,
  onReset,
}: TranslateHeaderProps) {
  return (
    <div className="px-8 pt-8">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-app-text tracking-tight">字幕翻译</h1>
        <div className="flex items-center gap-2 ml-auto">
          <LangSelect
            value={sourceLang}
            onChange={(l) => onUpdate({ sourceLang: l })}
            options={LANGUAGES}
          />
          <Icon name="chevron-right" className="w-3.5 h-3.5 text-app-text-tertiary flex-shrink-0" />
          <LangSelect
            value={targetLang}
            onChange={(l) => onUpdate({ targetLang: l })}
            options={LANGUAGES}
          />

          {showUploadStrategy && (
            <Dropdown
              ariaLabel="云端上传策略"
              trigger={
                <>
                  <Icon name="upload" className="h-3 w-3" />
                  <span>云端上传</span>
                  <Icon name="chevron-down" className="h-3 w-3 opacity-60" />
                </>
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-app-text">上传原视频</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-app-text-tertiary">
                    {uploadVideo
                      ? "视频将携带画面上传，适合需要视觉上下文的内容。"
                      : "视频会先提取音频，上传更快，也能减少流量消耗。"}
                  </p>
                </div>
                <Switch
                  checked={uploadVideo}
                  onChange={(checked) => onUpdate({ uploadVideo: checked })}
                  ariaLabel="上传原视频"
                />
              </div>
              <div className="mt-3 border-t border-app-border-light pt-2.5 text-[10px] leading-relaxed text-app-text-tertiary">
                音频文件始终直接上传；原视频超过 1GB 时会在处理前询问压缩或改用音频。
              </div>
            </Dropdown>
          )}

          <button
            onClick={onSettingsClick}
            className="relative ml-2 w-8 h-8 rounded-xl bg-app-surface hover:bg-app-hover ring-1 ring-app-border-light flex items-center justify-center transition-all duration-200 active:scale-95"
          >
            <Icon name="settings" className="w-4 h-4 text-app-text-secondary" />
            {!hasApiKey && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-app-error" />
            )}
          </button>
          {showReset && (
            <button
              onClick={onReset}
              className="px-3 py-1.5 text-[11px] text-app-text-tertiary hover:text-app-text-secondary bg-app-surface hover:bg-app-hover rounded-lg transition-all duration-200"
            >
              重置
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
