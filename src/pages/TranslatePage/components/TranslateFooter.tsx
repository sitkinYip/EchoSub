import ExportButton from "@/components/ExportButton";
import type { SubtitleItem } from "@/types";

type TranslateFooterProps = {
  appStep: "processing" | "preview";
  error: string | null;
  subtitleItems: SubtitleItem[];
  videoFileName?: string;
};

export default function TranslateFooter({
  appStep,
  error,
  subtitleItems,
  videoFileName,
}: TranslateFooterProps) {
  return (
    <div className="flex-shrink-0 px-8 py-4 bg-app-bg/80 backdrop-blur-xl border-t border-app-border-light">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        <span className="text-xs text-app-text-tertiary">
          {appStep === "processing"
            ? error
              ? "处理出错"
              : "处理中..."
            : `${subtitleItems.length} 条字幕`}
        </span>
        <ExportButton
          items={subtitleItems}
          disabled={appStep !== "preview"}
          videoFileName={videoFileName}
        />
      </div>
    </div>
  );
}
