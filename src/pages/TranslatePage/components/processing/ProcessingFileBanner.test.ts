import { describe, expect, it } from "vitest";
import type { PipelineStep } from "@/pages/TranslatePage/utils/pipelineTypes";
import { getProcessingBannerStatus } from "./ProcessingFileBanner";

const steps: PipelineStep[] = [
  {
    key: "analyze-file",
    label: "分析文件",
    description: "读取媒体信息",
    status: "done",
  },
  {
    key: "process-media",
    label: "处理视频",
    description: "准备上传文件",
    status: "done",
  },
  {
    key: "upload-media",
    label: "上传媒体文件",
    description: "上传到云端",
    status: "error",
  },
  {
    key: "cloud-media-translate",
    label: "云端识别与翻译",
    description: "生成字幕",
    status: "pending",
  },
];

describe("getProcessingBannerStatus", () => {
  it("keeps the completed ratio and turns the banner red after an error", () => {
    expect(getProcessingBannerStatus(steps, "", "OSS 上传失败")).toEqual({
      label: "上传媒体文件失败",
      count: "2/4",
      progressPercent: 50,
      tone: "error",
    });
  });

  it("uses the live progress message while processing", () => {
    const activeSteps = steps.map((step) => ({
      ...step,
      status:
        step.key === "upload-media"
          ? ("active" as const)
          : step.status === "error"
            ? ("pending" as const)
            : step.status,
    }));

    expect(getProcessingBannerStatus(activeSteps, "正在上传媒体文件", null)).toEqual({
      label: "正在上传媒体文件",
      count: "2/4",
      progressPercent: 50,
      tone: "active",
    });
  });

  it("shows only the completed state at the end", () => {
    expect(getProcessingBannerStatus(steps, "", null, true)).toEqual({
      label: "已完成",
      progressPercent: 100,
      tone: "complete",
    });
  });
});
