import { renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import usePipelineAutoScroll from "./usePipelineAutoScroll";

describe("usePipelineAutoScroll", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls the shared content container when processing output changes", () => {
    const scrollTo = vi.fn();
    const container = {
      scrollHeight: 720,
      scrollTo,
    } as unknown as HTMLDivElement;
    const ref = { current: container } as RefObject<HTMLDivElement>;

    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const { rerender } = renderHook(({ updateKey }) => usePipelineAutoScroll(ref, updateKey), {
      initialProps: { updateKey: "step:active" },
    });

    expect(scrollTo).not.toHaveBeenCalled();

    rerender({ updateKey: "step:error|OSS 上传失败" });

    expect(scrollTo).toHaveBeenCalledWith({
      top: 720,
      behavior: "smooth",
    });
  });
});
