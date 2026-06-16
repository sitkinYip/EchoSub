import { useEffect, useRef, useState } from "react";
import { useModalStore } from "@/stores/modalStore";
import Icon from "@/components/Icon";
import { MODAL_WIDTHS } from "@/config/modals";
import type { ModalEntry } from "@/stores/modalStore";

export default function ModalRenderer() {
  const stack = useModalStore((s) => s.stack);
  if (stack.length === 0) return null;

  return (
    <>
      {stack.map((entry, i) => (
        <ModalInstance key={entry.id} entry={entry} isTop={i === stack.length - 1} />
      ))}
    </>
  );
}

const MODAL_ANIM_DURATION = 300;

function ModalInstance({ entry, isTop }: { entry: ModalEntry; isTop: boolean }) {
  const closeTop = useModalStore((s) => s.closeTop);
  const markLeaving = useModalStore((s) => s.markLeaving);
  const [phase, setPhase] = useState<"enter" | "active" | "exit">("enter");
  const backdropRef = useRef<HTMLDivElement>(null);

  // Enter animation on mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase("active"));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Listen for external leaving signal
  useEffect(() => {
    if (entry.leaving && phase === "active") {
      setPhase("exit");
    }
  }, [entry.leaving, phase]);

  // Actually remove after exit animation completes
  useEffect(() => {
    if (phase === "exit") {
      const t = setTimeout(() => markLeaving(entry.id), MODAL_ANIM_DURATION + 50);
      return () => clearTimeout(t);
    }
  }, [phase, entry.id, markLeaving]);

  const handleMaskClick = () => {
    if (entry.config.maskClosable && isTop) closeTop();
  };

  const close = () => closeTop();

  const { config } = entry;
  const panelClass = MODAL_WIDTHS[config.width] || MODAL_WIDTHS.sm;

  const Content = entry.Component;

  return (
    <div
      ref={backdropRef}
      onClick={handleMaskClick}
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
        ${phase === "active" ? "bg-black/60 backdrop-blur-sm" : "bg-transparent backdrop-blur-none"}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${panelClass} mx-4 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${phase === "active" ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-4"}`}
      >
        <div className="rounded-2xl bg-app-elevated ring-1 ring-app-border shadow-2xl p-6 max-h-[90vh] overflow-hidden flex flex-col relative">
          {config.showClose && (
            <button
              onClick={close}
              className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-app-surface hover:bg-app-hover flex items-center justify-center transition-colors"
            >
              <Icon name="close" className="w-4 h-4 text-app-text-tertiary" />
            </button>
          )}
          {Content ? <Content close={close} data={entry.data} /> : <Skeleton />}
        </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-5 w-1/3 rounded-lg bg-app-surface" />
      <div className="h-10 rounded-xl bg-app-surface" />
      <div className="h-10 rounded-xl bg-app-surface" />
    </div>
  );
}
