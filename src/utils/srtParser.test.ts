import { describe, expect, it } from "vitest";
import {
  itemsToSrt,
  itemsToVtt,
  parseModelOutput,
  parseModelOutputWithWarnings,
} from "./srtParser";

describe("srtParser", () => {
  it("parses standard SRT blocks", () => {
    const items = parseModelOutput(`1
00:00:01,000 --> 00:00:03,500
你好

2
00:00:04.2 --> 00:00:05.45
世界`);

    expect(items).toEqual([
      { index: 1, start: "00:00:01,000", end: "00:00:03,500", text: "你好" },
      { index: 2, start: "00:00:04,200", end: "00:00:05,450", text: "世界" },
    ]);
  });

  it("strips markdown fences from model output", () => {
    const items = parseModelOutput(`\`\`\`srt
1
00:00:00,000 --> 00:00:01,000
字幕
\`\`\``);

    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("字幕");
  });

  it("reports warnings when no subtitle format can be parsed", () => {
    const result = parseModelOutputWithWarnings("这不是 SRT，也没有时间戳");

    expect(result.items).toEqual([]);
    expect(result.warnings).toContain("无法识别任何字幕格式");
  });

  it("serializes SRT and VTT output", () => {
    const items = [{ index: 1, start: "00:00:01,000", end: "00:00:02,000", text: "hello" }];

    expect(itemsToSrt(items)).toBe("1\n00:00:01,000 --> 00:00:02,000\nhello\n");
    expect(itemsToVtt(items)).toContain("00:00:01.000 --> 00:00:02.000");
  });
});
