type ProcessingLiveOutputProps = {
  text: string;
  contained?: boolean;
};

export default function ProcessingLiveOutput({
  text,
  contained = true,
}: ProcessingLiveOutputProps) {
  if (!text) return null;

  return (
    <div className="rounded-2xl bg-app-surface-alt ring-1 ring-app-border">
      <div className="flex items-center justify-between border-b border-app-border-light px-5 py-3">
        <p className="text-xs font-medium text-app-text-tertiary">实时输出</p>
        <p className="text-[11px] text-app-text-tertiary">正在接收模型结果</p>
      </div>
      <div className={`${contained ? "max-h-64 overflow-y-auto" : ""} px-5 py-4`}>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-app-text-secondary">
          {text}
        </pre>
      </div>
    </div>
  );
}
