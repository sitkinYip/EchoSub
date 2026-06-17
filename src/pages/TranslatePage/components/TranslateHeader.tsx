import Icon from "@/components/Icon";
import LangSelect from "@/components/LangSelect";
import Popover from "@/components/Popover";
import { LANGUAGES } from "@/config";
import type { LanguageUpdate } from "../utils/types";
import type { Language } from "@/types";

type TranslateHeaderProps = {
  sourceLang: Language;
  targetLang: Language;
  uploadVideo: boolean;
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

          <div className="flex items-center">
            <button
              onClick={() => onUpdate({ uploadVideo: !uploadVideo })}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 active:scale-95
                ${uploadVideo ? "bg-app-accent-bg text-app-accent ring-1 ring-app-accent-ring" : "bg-app-surface text-app-text-tertiary ring-1 ring-app-border-light hover:text-app-text-secondary"}`}
            >
              <Icon name="video" className="w-3 h-3" />
              {uploadVideo ? "视频模式" : "音频模式"}
            </button>
            <Popover
              placement="bottom-end"
              widthClassName="w-64"
              title={uploadVideo ? "视频模式" : "音频模式"}
              content={
                uploadVideo
                  ? "AI 通过分析视频画面与音频内容获得更精准的翻译结果。单文件不超过 1GB。"
                  : "仅提取视频中的音频轨道进行翻译，速度更快，适合纯语音内容。"
              }
              className="ml-1.5"
            >
              <button
                type="button"
                aria-label="上传模式说明"
                className="w-5 h-5 rounded-md flex items-center justify-center text-app-text-tertiary/40 hover:text-app-text-tertiary hover:bg-app-hover transition-colors cursor-help"
              >
                <Icon name="help" className="w-3.5 h-3.5" />
              </button>
            </Popover>
          </div>

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
