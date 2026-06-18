import { describe, expect, it } from "vitest";
import {
  SEEK_TOLERANCE,
  getSeekClampEnd,
  shouldSeekBeyondBuffer,
} from "./seekLogic";

/** 构造一个类 TimeRanges 的对象用于测试。 */
function makeSeekable(ranges: [number, number][]): TimeRanges {
  return {
    length: ranges.length,
    start: (i: number) => ranges[i][0],
    end: (i: number) => ranges[i][1],
  } as unknown as TimeRanges;
}

describe("shouldSeekBeyondBuffer", () => {
  it("returns true when target exceeds seekable end beyond tolerance", () => {
    expect(shouldSeekBeyondBuffer(100, 50)).toBe(true);
    expect(shouldSeekBeyondBuffer(50.6, 50)).toBe(true); // 超过容差
  });

  it("returns false when target is within seekable range", () => {
    expect(shouldSeekBeyondBuffer(30, 50)).toBe(false);
    expect(shouldSeekBeyondBuffer(50, 50)).toBe(false);
    expect(shouldSeekBeyondBuffer(50.4, 50)).toBe(false); // 容差内
  });

  it("respects custom tolerance", () => {
    expect(shouldSeekBeyondBuffer(55, 50, 10)).toBe(false); // 10s 容差内
    expect(shouldSeekBeyondBuffer(61, 50, 10)).toBe(true);
  });

  it("handles non-finite inputs safely", () => {
    expect(shouldSeekBeyondBuffer(NaN, 50)).toBe(false);
    expect(shouldSeekBeyondBuffer(50, Infinity)).toBe(false);
    expect(shouldSeekBeyondBuffer(Infinity, 50)).toBe(false);
  });
});

describe("getSeekClampEnd", () => {
  it("returns seekable end when window is limited (transcoding)", () => {
    // seekable 0..48, duration 120 → 受限窗口，clamp 到 48
    const seekable = makeSeekable([[0, 48]]);
    expect(getSeekClampEnd(seekable, 120)).toBe(48);
  });

  it("returns duration when seekable covers full range (direct/complete)", () => {
    // seekable 0..120, duration 120 → 完整，clamp 到 duration
    const seekable = makeSeekable([[0, 120]]);
    expect(getSeekClampEnd(seekable, 120)).toBe(120);
  });

  it("returns duration when no seekable info", () => {
    expect(getSeekClampEnd(null, 120)).toBe(120);
    expect(getSeekClampEnd(undefined, 100)).toBe(100);
  });

  it("returns infinity when neither seekable nor duration available", () => {
    const empty = makeSeekable([]);
    expect(getSeekClampEnd(empty, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(getSeekClampEnd(null, NaN)).toBe(Number.POSITIVE_INFINITY);
  });

  it("uses last range end when multiple ranges", () => {
    const seekable = makeSeekable([
      [0, 10],
      [20, 40],
    ]);
    expect(getSeekClampEnd(seekable, 120)).toBe(40);
  });
});

describe("SEEK_TOLERANCE constant", () => {
  it("is a small positive value", () => {
    expect(SEEK_TOLERANCE).toBeGreaterThan(0);
    expect(SEEK_TOLERANCE).toBeLessThan(2);
  });
});
