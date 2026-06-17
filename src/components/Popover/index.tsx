import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

type PopoverPlacement = "top" | "top-end" | "bottom" | "bottom-end" | "left" | "right";
type PopoverTrigger = "hover" | "click";

type PopoverProps = {
  children: ReactNode;
  content: ReactNode;
  title?: ReactNode;
  placement?: PopoverPlacement;
  trigger?: PopoverTrigger;
  widthClassName?: string;
  className?: string;
  panelClassName?: string;
};

const PLACEMENT_CLASSES: Record<PopoverPlacement, string> = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  "top-end": "bottom-full right-0 mb-2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  "bottom-end": "top-full right-0 mt-2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
};

const ARROW_CLASSES: Record<PopoverPlacement, string> = {
  top: "-bottom-1 left-1/2 -translate-x-1/2",
  "top-end": "-bottom-1 right-3",
  bottom: "-top-1 left-1/2 -translate-x-1/2",
  "bottom-end": "-top-1 right-3",
  left: "-right-1 top-1/2 -translate-y-1/2",
  right: "-left-1 top-1/2 -translate-y-1/2",
};

export default function Popover({
  children,
  content,
  title,
  placement = "bottom",
  trigger = "hover",
  widthClassName = "w-60",
  className = "",
  panelClassName = "",
}: PopoverProps) {
  const id = useId();
  const rootRef = useRef<globalThis.HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || trigger !== "click") return;

    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as globalThis.Node)) setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, trigger]);

  const hoverProps =
    trigger === "hover"
      ? {
          onMouseEnter: () => setOpen(true),
          onMouseLeave: () => setOpen(false),
          onFocus: () => setOpen(true),
          onBlur: () => setOpen(false),
        }
      : {};
  const clickProps =
    trigger === "click"
      ? {
          onClick: () => setOpen((value) => !value),
        }
      : {};

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex ${className}`}
      aria-describedby={open ? id : undefined}
      {...hoverProps}
      {...clickProps}
    >
      {children}
      <span
        id={id}
        role="tooltip"
        className={`absolute z-50 ${PLACEMENT_CLASSES[placement]} ${widthClassName} pointer-events-none transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${open ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-1"}
        `}
      >
        <span
          className={`relative block rounded-xl bg-app-elevated/95 ring-1 ring-app-border shadow-2xl backdrop-blur-xl px-3 py-2.5 text-left ${panelClassName}`}
        >
          <span
            className={`absolute h-2 w-2 rotate-45 bg-app-elevated ring-1 ring-app-border ${ARROW_CLASSES[placement]}`}
          />
          {title && (
            <span className="relative block text-xs font-medium text-app-text leading-tight mb-1">
              {title}
            </span>
          )}
          <span className="relative block text-[11px] text-app-text-secondary leading-relaxed">
            {content}
          </span>
        </span>
      </span>
    </span>
  );
}
