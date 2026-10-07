"use client";
// A field row that opens a small panel: the task detail's "each field opens a popover" (SCREENS.md §10). Closes on
// Escape and on a click outside, the dismissal every popover shares (popover.tsx), and hands focus back to the row.
// Apart from popover.tsx so the shells, which use only its menu, do not carry it (SYSTEM_DESIGN.md §11.6).
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";
import { fieldClass } from "./field";
import { useDismiss } from "./popover";
import { RAISED } from "./sheet-parts";

export function FieldPopover({
  label,
  value,
  children,
  className = "",
}: {
  label: string;
  value: ReactNode;
  /** The panel's contents; call `close` when a choice has been made. */
  children: (close: () => void) => ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  const rootRef = useDismiss(open, close);

  // Hand focus back to the row when the panel has just closed.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-body hover:bg-hover"
      >
        <span className="text-ink-2">{label}</span>
        <span className="flex min-w-0 items-center gap-2 font-medium text-ink num">{value}</span>
      </button>
      {open && (
        <div id={panelId} role="dialog" aria-label={label} className={cx(RAISED, "absolute right-2 top-full z-30 mt-1 w-[calc(100%-1rem)] max-w-80 rounded-xl p-3")}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

/** The input used inside popover panels: the field primitive at the touch-aware height. */
export const FIELD_INPUT = fieldClass({ size: "auto" });
