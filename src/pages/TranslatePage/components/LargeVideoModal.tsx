import Icon from "@/components/Icon";
import type { ModalContentProps } from "@/config/modals";

interface LargeVideoData {
  videoName: string;
  sizeMB: string;
  onCompress: () => void;
  onSwitchToAudio: () => void;
}

export default function LargeVideoModal({ close, data }: ModalContentProps<LargeVideoData>) {
  return (
    <div>
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-app-accent-bg flex items-center justify-center flex-shrink-0">
          <Icon name="warning" className="w-5 h-5 text-app-accent" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-app-text">视频较大</h2>
          <p className="text-xs text-app-text-tertiary mt-0.5 truncate max-w-[260px]">
            {data.videoName}
          </p>
        </div>
      </div>

      <div className="space-y-3 mb-5">
        <div className="px-3 py-2.5 bg-app-surface-alt rounded-xl ring-1 ring-app-border-light">
          <p className="text-sm text-app-text">
            文件大小：<span className="font-medium text-app-accent">{data.sizeMB}</span>
          </p>
          <p className="text-xs text-app-text-tertiary mt-1">
            超过云端 1GB 上传限制，需压缩处理后上传
          </p>
        </div>

        <div className="px-3 py-2.5 bg-app-surface-alt rounded-xl ring-1 ring-app-border-light">
          <div className="flex items-start gap-2">
            <Icon
              name="spinner"
              className="w-3.5 h-3.5 text-app-text-tertiary mt-0.5 flex-shrink-0"
            />
            <p className="text-xs text-app-text-tertiary leading-relaxed">
              压缩会根据视频分辨率自动选择最优策略，耗时取决于视频时长。
              若压缩后仍超过限制，将自动切换为音频翻译。
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => {
            data.onCompress();
            close();
          }}
          className="w-full px-4 py-2.5 rounded-xl bg-app-btn hover:bg-app-btn-hover text-app-text transition-all text-sm font-medium active:scale-[0.98]"
        >
          继续压缩视频
        </button>
        <button
          onClick={() => {
            data.onSwitchToAudio();
            close();
          }}
          className="w-full px-4 py-2.5 rounded-xl bg-app-surface hover:bg-app-hover text-app-text-secondary transition-all text-sm font-medium active:scale-[0.98]"
        >
          转为音频翻译
        </button>
      </div>
    </div>
  );
}
