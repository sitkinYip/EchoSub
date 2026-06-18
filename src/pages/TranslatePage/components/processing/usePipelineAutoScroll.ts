import { useEffect, useRef, type RefObject } from "react";

export default function usePipelineAutoScroll(
  containerRef: RefObject<HTMLDivElement>,
  updateKey: string,
) {
  const previousUpdateKeyRef = useRef(updateKey);

  useEffect(() => {
    if (previousUpdateKeyRef.current === updateKey) return;

    if (!previousUpdateKeyRef.current) {
      previousUpdateKeyRef.current = updateKey;
      return;
    }

    previousUpdateKeyRef.current = updateKey;

    const frame = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;

      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [containerRef, updateKey]);
}
