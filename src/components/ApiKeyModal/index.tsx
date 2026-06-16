import { useState } from "react";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { useSettingsStore } from "@/stores/settingsStore";
import type { ModalContentProps } from "@/config/modals";

interface ApiKeyData {
  onCancel?: () => void;
  onSaved?: (k: string, s: string, t: string, v: boolean) => void;
}

export default function ApiKeyModal({ close, data }: ModalContentProps<ApiKeyData>) {
  const { apiKey, sourceLang, targetLang, uploadVideo, update } = useSettingsStore();

  const [key, setKey] = useState(apiKey);
  const [src] = useState(sourceLang);
  const [tgt] = useState(targetLang);
  const [upload, setUpload] = useState(uploadVideo);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    setSaving(true);
    if (data.onSaved) {
      data.onSaved(trimmed, src, tgt, upload);
    } else {
      await update({ apiKey: trimmed, sourceLang: src, targetLang: tgt, uploadVideo: upload });
    }
    setSaving(false);
    close();
  };

  const handleCancel = () => {
    data.onCancel?.();
    close();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold text-app-text">API Key</h2>
      </div>
      <div className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-app-text-secondary mb-1.5 tracking-wide uppercase">
            DashScope API Key
          </label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full px-4 py-2.5 bg-app-surface ring-1 ring-app-border rounded-xl text-app-text placeholder:text-app-text-tertiary focus:outline-none focus:ring-app-border transition-all text-sm"
          />
        </div>
        <div className="flex items-center justify-between px-3 py-2.5 bg-app-surface-alt rounded-xl ring-1 ring-app-border-light">
          <div>
            <p className="text-sm text-app-text">直接上传原视频</p>
            <p className="text-xs text-app-text-tertiary mt-0.5">跳过音频提取，画面+语音混合识别</p>
          </div>
          <button
            onClick={() => setUpload(!upload)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full flex-shrink-0 transition-colors ${upload ? "bg-app-accent" : "bg-app-hover"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${upload ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
        </div>
        <div className="text-xs text-app-text-tertiary space-y-1">
          <p>
            获取 API Key：{" "}
            <button
              type="button"
              onClick={() => shellOpen("https://dashscope.aliyun.com/")}
              className="text-app-accent hover:underline bg-transparent border-none p-0 text-xs cursor-pointer"
            >
              DashScope 控制台
            </button>
          </p>
          <p>模型：qwen3.5-omni-plus</p>
        </div>
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-2.5 rounded-xl bg-app-surface hover:bg-app-hover text-app-text-secondary transition-all text-sm font-medium active:scale-[0.98]"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!key.trim() || saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-app-btn hover:bg-app-btn-hover disabled:bg-app-surface disabled:text-app-text-tertiary text-app-text transition-all text-sm font-medium active:scale-[0.98] disabled:cursor-not-allowed"
          >
            {saving ? "保存中..." : "保存并开始"}
          </button>
        </div>
      </div>
    </div>
  );
}
