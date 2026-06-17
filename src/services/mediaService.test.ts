import { describe, expect, it } from "vitest";
import { formatDuration, formatMediaSummary } from "./mediaService";

describe("mediaService formatting", () => {
  it("formats known durations with file size", () => {
    expect(formatDuration(65)).toBe("1 分 5 秒");
    expect(formatMediaSummary({ durationSeconds: 65, size: 10 * 1024 * 1024 })).toBe(
      "时长 1 分 5 秒，大小 10.0 MB",
    );
  });

  it("does not display fake zero-second duration when probe cannot read duration", () => {
    expect(formatMediaSummary({ durationSeconds: 0, size: 10 * 1024 * 1024 })).toBe(
      "大小 10.0 MB，时长暂未识别",
    );
  });
});
