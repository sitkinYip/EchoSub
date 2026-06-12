import React from "react";

interface ProcessingPanelProps {
  progressMessage: string;
  isExtracting: boolean;
  isTranslating: boolean;
  subtitleCount: number;
  onCancel: () => void;
  hasError: string | null;
  isVideoMode: boolean;
}

const audioSteps = [
  { key: "extract", label: "提取音频", description: "使用 FFmpeg 从视频中提取音频" },
  { key: "upload", label: "上传文件", description: "将音频上传至云端临时存储" },
  { key: "transcribe", label: "语音识别与翻译", description: "AI 识别语音内容并翻译" },
  { key: "generate", label: "生成字幕", description: "流式接收翻译结果并实时渲染" },
];

const videoSteps = [
  { key: "upload", label: "上传文件", description: "将视频上传至云端临时存储" },
  { key: "transcribe", label: "视频识别与翻译", description: "AI 分析画面与语音并翻译" },
  { key: "generate", label: "生成字幕", description: "流式接收翻译结果并实时渲染" },
];

const ProcessingPanel: React.FC<ProcessingPanelProps> = ({
  progressMessage,
  isExtracting,
  isTranslating,
  subtitleCount,
  onCancel,
  hasError,
  isVideoMode,
}) => {
  const steps = isVideoMode ? videoSteps : audioSteps;
  const hasErrorOccurred = !!hasError;

  // 计算当前步骤索引
  // 音频模式: 0=提取音频, 1=上传文件, 2=识别翻译, 3=生成字幕
  // 视频模式: 0=上传文件, 1=识别翻译, 2=生成字幕
  let currentStep: number;
  if (isVideoMode) {
    currentStep = isExtracting ? 0 : isTranslating ? (subtitleCount > 0 ? 2 : 1) : 2;
  } else {
    currentStep = isExtracting ? 0 : isTranslating ? (subtitleCount > 0 ? 3 : 2) : 3;
  }

  return (
    <div className="bg-gray-900/50 rounded-2xl border border-gray-800 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">
          处理进度 · {isVideoMode ? "视频模式" : "音频模式"}
        </h3>
        {(isExtracting || isTranslating) && (
          <button
            onClick={onCancel}
            className="px-3 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            取消
          </button>
        )}
      </div>

      <div className="space-y-4">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isDone = index < currentStep;
          const isPending = index > currentStep;
          const isErrorStep = hasErrorOccurred && isActive;

          return (
            <div key={step.key} className="flex items-start gap-3">
              <div
                className={`
                  flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium
                  transition-all duration-300
                  ${isDone ? "bg-green-500/20 text-green-400" : ""}
                  ${isActive && !isErrorStep ? "bg-blue-500/20 text-blue-400 ring-2 ring-blue-500/30" : ""}
                  ${isErrorStep ? "bg-red-500/20 text-red-400 ring-2 ring-red-500/30" : ""}
                  ${isPending ? "bg-gray-800 text-gray-600" : ""}
                `}
              >
                {isDone ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : isErrorStep ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : isActive ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    isDone ? "text-green-400" : isErrorStep ? "text-red-400" : isActive ? "text-blue-300" : "text-gray-500"
                  }`}
                >
                  {step.label}
                </p>
                <p className={`text-xs mt-0.5 ${isErrorStep ? "text-red-400/70" : "text-gray-600"}`}>
                  {isActive ? progressMessage : step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {isTranslating && subtitleCount > 0 && (
        <div className="pt-2 border-t border-gray-800">
          <p className="text-sm text-gray-400">
            已接收 <span className="text-blue-400 font-semibold">{subtitleCount}</span>{" "}
            条字幕片段，正在实时渲染...
          </p>
        </div>
      )}

      {hasError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-400">{hasError}</p>
        </div>
      )}
    </div>
  );
};

export default ProcessingPanel;
