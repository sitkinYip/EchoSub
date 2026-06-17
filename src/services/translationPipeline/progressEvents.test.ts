import { describe, expect, it } from "vitest";
import { mapPipelineProgressMessage } from "./progressEvents";

describe("mapPipelineProgressMessage", () => {
  it("maps cloud media upload and translate progress", () => {
    expect(
      mapPipelineProgressMessage("正在上传文件（24.1 MB）...", { route: "cloud-video" }),
    ).toEqual([{ type: "activate", key: "upload-media", detail: "正在上传文件（24.1 MB）..." }]);

    expect(mapPipelineProgressMessage("AI 正在识别并翻译...", { route: "cloud-audio" })).toEqual([
      { type: "complete", key: "upload-media", detail: "媒体上传完成" },
      { type: "activate", key: "cloud-media-translate", detail: "AI 正在识别并翻译..." },
    ]);
  });

  it("maps local whisper and cloud text translation progress", () => {
    expect(mapPipelineProgressMessage("识别中 42%", { route: "local-cloud-text" })).toEqual([
      { type: "activate", key: "local-whisper", detail: "识别中 42%" },
    ]);

    expect(
      mapPipelineProgressMessage("正在翻译本地识别字幕...", { route: "local-cloud-text" }),
    ).toEqual([
      { type: "complete", key: "local-whisper", detail: "本地识别完成" },
      {
        type: "activate",
        key: "cloud-text-translate",
        detail: "正在翻译本地识别字幕...",
      },
    ]);
  });

  it("maps cloud-then-local fallback without treating it as a hard error", () => {
    expect(
      mapPipelineProgressMessage("云端文本翻译触发内容审核，切换本地字幕翻译...", {
        route: "local-cloud-then-local-text",
      }),
    ).toEqual([
      {
        type: "switch",
        key: "cloud-text-translate",
        detail: "内容审核未通过，已切换到本地字幕翻译",
      },
      {
        type: "activate",
        key: "local-llm-start",
        detail: "云端文本翻译触发内容审核，切换本地字幕翻译...",
      },
    ]);
  });

  it("ignores cloud upload text for local routes", () => {
    expect(
      mapPipelineProgressMessage("正在上传文件（24.1 MB）...", {
        route: "local-cloud-text",
      }),
    ).toEqual([]);
  });
});
