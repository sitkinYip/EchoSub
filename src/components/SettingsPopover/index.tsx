import { useState } from "react";
import type { Language } from "@/types";
import LangSelect from "@/components/LangSelect";
import { LANGUAGES } from "@/config";

interface Props {
  sourceLang: Language; targetLang: Language;
  onSourceLangChange: (l: Language) => void; onTargetLangChange: (l: Language) => void;
  apiKey: string; onApiKeyChange: (k: string) => void;
  onClose: () => void;
}

export default function SettingsPopover({
  sourceLang, targetLang,
  onSourceLangChange, onTargetLangChange,
  apiKey, onApiKeyChange, onClose,
}: Props) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-app-text-secondary tracking-wide uppercase">偏好设置</h3>
        <button onClick={onClose} className="text-[11px] text-app-text-tertiary hover:text-app-text-secondary">关闭</button>
      </div>

      <div className="space-y-2">
        <span className="text-xs text-app-text-tertiary">翻译方向</span>
        <div className="flex items-center gap-2">
          <LangSelect value={sourceLang} onChange={onSourceLangChange} options={LANGUAGES} />
          <span className="text-app-text-tertiary text-xs">→</span>
          <LangSelect value={targetLang} onChange={onTargetLangChange} options={LANGUAGES} />
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-app-text-tertiary">DashScope API Key</span>
          <button onClick={() => setShowKey(!showKey)} className="text-[11px] text-app-accent hover:underline">
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
          <p className="text-xs text-app-text-tertiary truncate">{apiKey.slice(0, 3)}***{apiKey.slice(-4)}</p>
        )}
      </div>
    </div>
  );
}
