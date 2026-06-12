import type { Language } from "@/types";

interface Props { sourceLang: Language; targetLang: Language; onSourceLangChange: (l: Language) => void; onTargetLangChange: (l: Language) => void; uploadVideo: boolean; onUploadVideoChange: (v: boolean) => void; onClose: () => void; }

export default function SettingsPopover({ sourceLang, targetLang, uploadVideo, onUploadVideoChange, onClose }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-app-text-secondary tracking-wide uppercase">偏好设置</h3>
        <button onClick={onClose} className="text-[11px] text-app-text-tertiary hover:text-app-text-secondary">关闭</button>
      </div>
      <div className="flex items-center justify-between px-3 py-2.5 bg-app-surface-alt rounded-xl ring-1 ring-app-border-light">
        <div><p className="text-sm text-app-text">{sourceLang} → {targetLang}</p><p className="text-xs text-app-text-tertiary mt-0.5">语言方向</p></div>
      </div>
      <div className="flex items-center justify-between px-3 py-2.5 bg-app-surface-alt rounded-xl ring-1 ring-app-border-light">
        <div><p className="text-sm text-app-text">直接上传视频</p><p className="text-xs text-app-text-tertiary mt-0.5">画面+语音混合识别</p></div>
        <button onClick={() => onUploadVideoChange(!uploadVideo)} className={`relative inline-flex h-6 w-11 items-center rounded-full flex-shrink-0 transition-colors ${uploadVideo ? "bg-app-accent" : "bg-app-hover"}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${uploadVideo ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>
    </div>
  );
}
