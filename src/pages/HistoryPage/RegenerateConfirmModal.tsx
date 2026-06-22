import { useState } from "react";
import Icon from "@/components/Icon";
import LangSelect from "@/components/LangSelect";
import { showModal } from "@/components/Modal/create";
import { LANGUAGES } from "@/config";
import type { TranslationFallback, TranslateEngine } from "@/config";
import type { ModalContentProps } from "@/config/modals";
import type { HistoryEntry, Language } from "@/types";
import {
  checkLocalModelGap,
  resolveRegenerateSettings,
  toOverrides,
  type GlobalTranslationSettings,
  type ResolvedRegenerateSettings,
  type TranslationOverrides,
} from "@/pages/TranslatePage/utils/translationSettings";

interface RegenerateData {
  videoName: string;
  videoPath: string;
  exists: boolean;
  history: Pick<
    HistoryEntry,
    | "mode"
    | "sourceLang"
    | "targetLang"
    | "engine"
    | "translationFallback"
    | "whisperModelId"
    | "whisperModelPath"
    | "translateModelId"
    | "translateModelPath"
  >;
  globalSettings: GlobalTranslationSettings;
  onConfirm: (overrides: Required<TranslationOverrides>) => void;
}

const FALLBACK_OPTIONS: { value: TranslationFallback; label: string }[] = [
  { value: "cloud-only", label: "仅云端" },
  { value: "cloud-then-local", label: "失败后本地" },
  { value: "local-only", label: "仅本地" },
];

export default function RegenerateConfirmModal({ close, data }: ModalContentProps<RegenerateData>) {
  const { settings: initial, restored } = resolveRegenerateSettings(
    data.history,
    data.globalSettings,
  );

  const [settings, setSettings] = useState<ResolvedRegenerateSettings>(initial);
  const [modelError, setModelError] = useState<string | null>(null);

  // 切换引擎时联动：local 强制 uploadVideo=false；切回 cloud 恢复历史值
  const switchEngine = (engine: TranslateEngine) => {
    setModelError(null);
    if (engine === "local") {
      setSettings((s) => ({ ...s, engine, uploadVideo: false }));
    } else {
      const historicalVideo = data.history.mode === "video";
      setSettings((s) => ({ ...s, engine, uploadVideo: historicalVideo }));
    }
  };

  const openModelManager = (tab: "whisper" | "translate") => {
    showModal("ModelManager", {
      initialTab: tab,
      selectedId: settings.whisperModelId,
      selectedPath: settings.whisperModelPath,
      selectedTranslateId: settings.translateModelId,
      selectedTranslatePath: settings.translateModelPath,
      // 回写弹窗本地 state，不碰全局设置
      onSelected: (model: { id: string; path: string }) => {
        setSettings((s) => ({ ...s, whisperModelId: model.id, whisperModelPath: model.path }));
        setModelError(null);
      },
      onTranslateSelected: (model: { id: string; path: string }) => {
        setSettings((s) => ({
          ...s,
          translateModelId: model.id,
          translateModelPath: model.path,
        }));
        setModelError(null);
      },
    });
  };

  const handleConfirm = () => {
    if (settings.engine === "local") {
      const gap = checkLocalModelGap({
        sourceLang: settings.sourceLang,
        targetLang: settings.targetLang,
        translationFallback: settings.translationFallback,
        whisperModelPath: settings.whisperModelPath,
        translateModelPath: settings.translateModelPath,
      });
      if (gap.missing) {
        setModelError(
          gap.missing === "whisper" ? "请先选择 Whisper 本地模型" : "请先选择本地字幕翻译模型",
        );
        return;
      }
    }
    setModelError(null);
    data.onConfirm(toOverrides(settings));
    close();
  };

  return (
    <div className="flex flex-col max-h-[80vh]">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-app-text">重新生成字幕</h2>
      </div>

      <div className="space-y-5 overflow-y-auto pr-1 -mr-1">
        {/* Video name */}
        <div className="px-3 py-2.5 bg-app-surface-alt rounded-xl ring-1 ring-app-border-light">
          <p className="text-sm text-app-text truncate font-medium" title={data.videoName}>
            {data.videoName}
          </p>
        </div>

        {/* File existence check */}
        {!data.exists ? (
          <div className="p-3 rounded-xl bg-app-error-bg ring-1 ring-app-error-ring flex items-start gap-3">
            <Icon name="close" className="w-4 h-4 text-app-error flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-app-error font-medium">文件已丢失</p>
              <p className="text-xs text-app-text-tertiary mt-0.5">
                原视频文件已不存在或被移动，无法重新生成。
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-app-success-bg ring-1 ring-app-success-ring flex items-start gap-3">
            <Icon name="check" className="w-4 h-4 text-app-success flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-app-success font-medium">文件就绪</p>
              <p className="text-xs text-app-text-tertiary mt-0.5 truncate" title={data.videoPath}>
                {data.videoPath}
              </p>
            </div>
          </div>
        )}

        {/* 降级提示：老历史记录无引擎/模型设置 */}
        {!restored && (
          <p className="text-xs text-app-text-tertiary">
            该记录未保存原翻译设置，已使用当前默认配置。
          </p>
        )}

        {/* Language selectors */}
        <div>
          <label className="block text-xs font-medium text-app-text-secondary mb-2 tracking-wide uppercase">
            翻译方向
          </label>
          <div className="flex items-center gap-2">
            <LangSelect
              value={settings.sourceLang}
              onChange={(l: Language) => setSettings((s) => ({ ...s, sourceLang: l }))}
              options={LANGUAGES}
            />
            <Icon
              name="chevron-right"
              className="w-3.5 h-3.5 text-app-text-tertiary flex-shrink-0"
            />
            <LangSelect
              value={settings.targetLang}
              onChange={(l: Language) => setSettings((s) => ({ ...s, targetLang: l }))}
              options={LANGUAGES}
            />
          </div>
        </div>

        {/* 识别引擎 */}
        <div className="space-y-2">
          <span className="text-xs text-app-text-tertiary">识别引擎</span>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-app-surface p-1 ring-1 ring-app-border-light">
            {(["cloud", "local"] as const).map((item) => (
              <button
                key={item}
                onClick={() => switchEngine(item)}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${
                  settings.engine === item
                    ? "bg-app-elevated text-app-text ring-1 ring-app-border"
                    : "text-app-text-tertiary hover:text-app-text-secondary"
                }`}
              >
                <Icon name={item === "cloud" ? "upload" : "cpu"} className="w-3.5 h-3.5" />
                {item === "cloud" ? "云端" : "本地"}
              </button>
            ))}
          </div>
        </div>

        {/* 本地引擎额外设置 */}
        {settings.engine === "local" && (
          <>
            <div className="space-y-2">
              <span className="text-xs text-app-text-tertiary">字幕翻译策略</span>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-app-surface p-1 ring-1 ring-app-border-light">
                {FALLBACK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSettings((s) => ({ ...s, translationFallback: opt.value }))}
                    className={`rounded-lg px-1.5 py-1.5 text-[11px] font-medium transition-all ${
                      settings.translationFallback === opt.value
                        ? "bg-app-elevated text-app-text ring-1 ring-app-border"
                        : "text-app-text-tertiary hover:text-app-text-secondary"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Whisper 模型 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-app-text-tertiary">Whisper 模型</span>
                <button
                  onClick={() => openModelManager("whisper")}
                  className="text-[11px] text-app-accent hover:underline"
                >
                  管理
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-app-surface ring-1 ring-app-border-light px-3 py-2">
                <Icon name="cpu" className="w-3.5 h-3.5 text-app-text-tertiary" />
                <span className="text-xs text-app-text-secondary truncate">
                  {settings.whisperModelPath ? settings.whisperModelId : "未选择本地模型"}
                </span>
              </div>
            </div>

            {/* 字幕翻译模型 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-app-text-tertiary">字幕翻译模型</span>
                <button
                  onClick={() => openModelManager("translate")}
                  className="text-[11px] text-app-accent hover:underline"
                >
                  管理
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-app-surface ring-1 ring-app-border-light px-3 py-2">
                <Icon name="chat" className="w-3.5 h-3.5 text-app-text-tertiary" />
                <span className="text-xs text-app-text-secondary truncate">
                  {settings.translateModelPath ? settings.translateModelId : "未选择翻译模型"}
                </span>
              </div>
            </div>
          </>
        )}

        {/* 云端引擎：上传模式开关 */}
        {settings.engine === "cloud" && (
          <div className="flex items-center justify-between px-3 py-2.5 bg-app-surface-alt rounded-xl ring-1 ring-app-border-light">
            <div>
              <p className="text-sm text-app-text">直接上传原视频</p>
              <p className="text-xs text-app-text-tertiary mt-0.5">
                跳过音频提取，画面+语音混合识别
              </p>
            </div>
            <button
              onClick={() => setSettings((s) => ({ ...s, uploadVideo: !s.uploadVideo }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full flex-shrink-0 transition-colors ${
                settings.uploadVideo ? "bg-app-accent" : "bg-app-hover"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.uploadVideo ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        )}

        {/* 模型缺失提示 */}
        {modelError && (
          <div className="p-2.5 rounded-xl bg-app-error-bg ring-1 ring-app-error-ring flex items-start gap-2">
            <Icon name="close" className="w-3.5 h-3.5 text-app-error flex-shrink-0 mt-0.5" />
            <p className="text-xs text-app-error">{modelError}</p>
          </div>
        )}
      </div>

      {/* 操作按钮固定在底部 */}
      <div className="flex gap-3 pt-5 mt-1">
        <button
          onClick={close}
          className="flex-1 px-4 py-2.5 rounded-xl bg-app-surface hover:bg-app-hover text-app-text-secondary transition-all text-sm font-medium active:scale-[0.98]"
        >
          取消
        </button>
        <button
          onClick={handleConfirm}
          disabled={!data.exists}
          className="flex-1 px-4 py-2.5 rounded-xl bg-app-btn hover:bg-app-btn-hover disabled:bg-app-surface disabled:text-app-text-tertiary text-app-text transition-all text-sm font-medium active:scale-[0.98] disabled:cursor-not-allowed"
        >
          确认开始
        </button>
      </div>
    </div>
  );
}
