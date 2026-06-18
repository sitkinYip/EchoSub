import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

type DropdownPlacement = "bottom" | "bottom-end";

type DropdownProps = {
  trigger: ReactNode;
  children: ReactNode;
  ariaLabel: string;
  placement?: DropdownPlacement;
  widthClassName?: string;
  className?: string;
  panelClassName?: string;
};

const PLACEMENT_CLASSES: Record<DropdownPlacement, string> = {
  bottom: "left-1/2 -translate-x-1/2",
  "bottom-end": "right-0",
};

export default function Dropdown({
  trigger,
  children,
  ariaLabel,
  placement = "bottom-end",
  widthClassName = "w-72",
  className = "",
  panelClassName = "",
}: DropdownProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const suppressFocusOpenRef = useRef(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as globalThis.Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        const trigger =
          rootRef.current?.querySelector<globalThis.HTMLButtonElement>("[data-dropdown-trigger]");
        if (trigger && globalThis.document.activeElement !== trigger) {
          suppressFocusOpenRef.current = true;
          trigger.focus();
        }
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => {
        if (suppressFocusOpenRef.current) {
          suppressFocusOpenRef.current = false;
          return;
        }
        setOpen(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        data-dropdown-trigger
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-app-surface px-2.5 py-1.5 text-[11px] font-medium text-app-text-tertiary ring-1 ring-app-border-light transition-all duration-200 hover:bg-app-hover hover:text-app-text-secondary focus:outline-none focus:ring-app-accent-ring active:scale-[0.98]"
      >
        {trigger}
      </button>

      <div
        id={panelId}
        role="dialog"
        aria-label={ariaLabel}
        aria-hidden={!open}
        className={`absolute top-full z-50 pt-2 ${PLACEMENT_CLASSES[placement]} ${widthClassName} transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          open
            ? "visible translate-y-0 scale-100 opacity-100"
            : "invisible -translate-y-1 scale-[0.98] opacity-0"
        }`}
      >
        <div
          className={`rounded-2xl bg-app-elevated/95 p-3.5 text-left shadow-2xl ring-1 ring-app-border backdrop-blur-xl ${panelClassName}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
