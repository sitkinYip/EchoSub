import { useState } from "react";
import type { Language } from "@/types";
import LangSelect from "@/components/LangSelect";
import Icon from "@/components/Icon";
import { LANGUAGES, type TranslateEngine, type TranslationFallback } from "@/config";
import { showModal } from "@/components/Modal/create";

interface Props {
  sourceLang: Language;
  targetLang: Language;
  onSourceLangChange: (l: Language) => void;
  onTargetLangChange: (l: Language) => void;
  engine: TranslateEngine;
  onEngineChange: (engine: TranslateEngine) => void;
  translationFallback: TranslationFallback;
  onTranslationFallbackChange: (fallback: TranslationFallback) => void;
  whisperModelId: string;
  whisperModelPath: string;
  onWhisperModelChange: (id: string, path: string) => void;
  translateModelId: string;
  translateModelPath: string;
  onTranslateModelChange: (id: string, path: string) => void;
  apiKey: string;
  onApiKeyChange: (k: string) => void;
  onClose: () => void;
}

export default function SettingsPopover({
  sourceLang,
  targetLang,
  onSourceLangChange,
  onTargetLangChange,
  engine,
  onEngineChange,
  translationFallback,
  onTranslationFallbackChange,
  whisperModelId,
  whisperModelPath,
  onWhisperModelChange,
  translateModelId,
  translateModelPath,
  onTranslateModelChange,
  apiKey,
  onApiKeyChange,
  onClose,
}: Props) {
  const [showKey, setShowKey] = useState(false);
  const needsApiKey =
    engine === "cloud" || (sourceLang !== targetLang && translationFallback !== "local-only");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-app-text-secondary tracking-wide uppercase">
          偏好设置
        </h3>
        <button
          onClick={onClose}
          className="text-[11px] text-app-text-tertiary hover:text-app-text-secondary"
        >
          关闭
        </button>
      </div>

      <div className="space-y-2">
        <span className="text-xs text-app-text-tertiary">翻译方向</span>
        <div className="flex items-center gap-2">
          <LangSelect value={sourceLang} onChange={onSourceLangChange} options={LANGUAGES} />
          <span className="text-app-text-tertiary text-xs">→</span>
          <LangSelect value={targetLang} onChange={onTargetLangChange} options={LANGUAGES} />
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-xs text-app-text-tertiary">识别引擎</span>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-app-surface p-1 ring-1 ring-app-border-light">
          {(["cloud", "local"] as const).map((item) => (
            <button
              key={item}
              onClick={() => onEngineChange(item)}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${
                engine === item
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

      {engine === "local" && (
        <>
          <div className="space-y-2">
            <span className="text-xs text-app-text-tertiary">字幕翻译策略</span>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-app-surface p-1 ring-1 ring-app-border-light">
              {(
                [
                  ["cloud-only", "仅云端"],
                  ["cloud-then-local", "失败后本地"],
                  ["local-only", "仅本地"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => onTranslationFallbackChange(value)}
                  className={`rounded-lg px-1.5 py-1.5 text-[11px] font-medium transition-all ${
                    translationFallback === value
                      ? "bg-app-elevated text-app-text ring-1 ring-app-border"
                      : "text-app-text-tertiary hover:text-app-text-secondary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-app-text-tertiary">Whisper 模型</span>
              <button
                onClick={() =>
                  showModal("ModelManager", {
                    selectedId: whisperModelId,
                    selectedPath: whisperModelPath,
                    selectedTranslateId: translateModelId,
                    selectedTranslatePath: translateModelPath,
                    initialTab: "whisper",
                    onSelected: (model: { id: string; path: string }) =>
                      onWhisperModelChange(model.id, model.path),
                    onTranslateSelected: (model: { id: string; path: string }) =>
                      onTranslateModelChange(model.id, model.path),
                  })
                }
                className="text-[11px] text-app-accent hover:underline"
              >
                管理
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-app-surface ring-1 ring-app-border-light px-3 py-2">
              <Icon name="cpu" className="w-3.5 h-3.5 text-app-text-tertiary" />
              <span className="text-xs text-app-text-secondary truncate">
                {whisperModelPath ? whisperModelId : "未选择本地模型"}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-app-text-tertiary">字幕翻译模型</span>
              <button
                onClick={() =>
                  showModal("ModelManager", {
                    initialTab: "translate",
                    selectedId: whisperModelId,
                    selectedPath: whisperModelPath,
                    selectedTranslateId: translateModelId,
                    selectedTranslatePath: translateModelPath,
                    onSelected: (model: { id: string; path: string }) =>
                      onWhisperModelChange(model.id, model.path),
                    onTranslateSelected: (model: { id: string; path: string }) =>
                      onTranslateModelChange(model.id, model.path),
                  })
                }
                className="text-[11px] text-app-accent hover:underline"
              >
                管理
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-app-surface ring-1 ring-app-border-light px-3 py-2">
              <Icon name="chat" className="w-3.5 h-3.5 text-app-text-tertiary" />
              <span className="text-xs text-app-text-secondary truncate">
                {translateModelPath ? translateModelId : "未选择翻译模型"}
              </span>
            </div>
          </div>
        </>
      )}

      {/* API Key */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-app-text-tertiary">
            DashScope API Key{needsApiKey ? "" : "（同语言本地识别无需）"}
          </span>
          <button
            onClick={() => setShowKey(!showKey)}
            className="text-[11px] text-app-accent hover:underline"
          >
            {showKey ? "隐藏" : apiKey ? "修改" : "设置"}
          </button>
        </div>
        {showKey && (
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full px-3 py-2 bg-app-surface ring-1 ring-app-border rounded-lg text-app-text placeholder:text-app-text-tertiary focus:outline-none focus:ring-app-accent-ring text-xs transition-all"
          />
        )}
        {!showKey && apiKey && (
          <p className="text-xs text-app-text-tertiary truncate">
            {apiKey.slice(0, 3)}***{apiKey.slice(-4)}
          </p>
        )}
      </div>
    </div>
  );
}
