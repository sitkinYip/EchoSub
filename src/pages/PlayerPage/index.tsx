import Icon from "@/components/Icon";

export default function PlayerPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-app-surface-alt ring-1 ring-app-border-light flex items-center justify-center">
          <Icon name="player" className="w-7 h-7 text-app-text-tertiary" />
        </div>
        <h2 className="text-lg font-medium text-app-text-secondary mb-2">视频播放器</h2>
        <p className="text-sm text-app-text-tertiary leading-relaxed">翻译后的字幕可在此搭配视频播放预览。<br />此功能即将推出。</p>
      </div>
    </div>
  );
}
