import React, { useState, useEffect } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { LANGUAGES, type Language } from "../types";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (apiKey: string, sourceLang: Language, targetLang: Language, uploadVideo: boolean) => void;
  currentKey: string;
  currentSourceLang: Language;
  currentTargetLang: Language;
  currentUploadVideo: boolean;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  onSaved,
  currentKey,
  currentSourceLang,
  currentTargetLang,
  currentUploadVideo,
}) => {
  const [apiKey, setApiKey] = useState(currentKey);
  const [sourceLang, setSourceLang] = useState<Language>(currentSourceLang);
  const [targetLang, setTargetLang] = useState<Language>(currentTargetLang);
  const [uploadVideo, setUploadVideo] = useState(currentUploadVideo);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setApiKey(currentKey);
    setSourceLang(currentSourceLang);
    setTargetLang(currentTargetLang);
    setUploadVideo(currentUploadVideo);
  }, [currentKey, currentSourceLang, currentTargetLang, currentUploadVideo, open]);

  if (!open) return null;

  const handleSave = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;

    setSaving(true);

    onSaved(trimmed, sourceLang, targetLang, uploadVideo);

    try {
      const store = await Store.load("config.json");
      await store.set("apiKey", trimmed);
      await store.set("sourceLang", sourceLang);
      await store.set("targetLang", targetLang);
      await store.set("uploadVideo", uploadVideo);
      await store.save();
    } catch (err) {
      console.error("持久化设置失败:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-100">设置</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5">
          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              DashScope API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          {/* 上传模式切换 */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-gray-800/50 rounded-xl border border-gray-700/50">
            <div>
              <p className="text-sm text-gray-300">直接上传原视频</p>
              <p className="text-xs text-gray-500 mt-0.5">
                开启后跳过音频提取，利用画面+语音混合识别，提升准确率
              </p>
            </div>
            <button
              onClick={() => setUploadVideo(!uploadVideo)}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full flex-shrink-0 transition-colors
                ${uploadVideo ? "bg-blue-600" : "bg-gray-600"}
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${uploadVideo ? "translate-x-6" : "translate-x-1"}
                `}
              />
            </button>
          </div>

          <div className="text-xs text-gray-500 space-y-1">
            <p>
              如何获取 API Key？访问{" "}
              <button
                type="button"
                onClick={() => shellOpen("https://dashscope.aliyun.com/")}
                className="text-blue-400 hover:underline cursor-pointer bg-transparent border-none p-0 text-xs"
              >
                DashScope 控制台
              </button>
            </p>
            <p>模型：qwen3.5-omni-plus（多模态音频/视频识别）</p>
            <p className="text-gray-600">
              当前：{sourceLang} → {targetLang} · {uploadVideo ? "视频模式" : "音频模式"}
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors text-sm font-medium"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!apiKey.trim() || saving}
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors text-sm font-medium"
            >
              {saving ? "保存中..." : "保存并开始"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
