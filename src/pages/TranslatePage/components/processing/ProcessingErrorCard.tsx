import Icon from "@/components/Icon";

type ProcessingErrorCardProps = {
  message: string;
};

export default function ProcessingErrorCard({ message }: ProcessingErrorCardProps) {
  return (
    <div className="rounded-xl bg-app-error-bg ring-1 ring-app-error-ring px-4 py-3">
      <div className="flex gap-3">
        <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-app-error-bg text-app-error ring-1 ring-app-error-ring">
          <Icon name="warning" className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-app-error">处理未完成</p>
          <p className="mt-1 text-xs leading-relaxed text-app-error">{message}</p>
        </div>
      </div>
    </div>
  );
}
