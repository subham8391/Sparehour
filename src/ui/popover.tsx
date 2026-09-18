"use client";
// A field row that opens a small panel: the task detail's "each field opens a
// popover" (SCREENS.md §10). Closes on Escape and on a click outside; hands
// focus back to the row. Panels are raised: surface-3 with the ink shadow in
// light, a line-strong hairline and no shadow in dark (DESIGN_SYSTEM.md §4).
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { fieldClass } from "./field";
import { Icon } from "./icons";

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
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      // Hand focus back to the row when the panel has just closed.
      if (wasOpen.current) {
        wasOpen.current = false;
        buttonRef.current?.focus();
      }
      return;
    }
    wasOpen.current = true;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

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
        <div id={panelId} role="dialog" aria-label={label} className="absolute right-2 top-full z-30 mt-1 w-[calc(100%-1rem)] max-w-80 rounded-xl border border-raised-border bg-surface-3 p-3 shadow-raised">
          {children(close)}
        </div>
      )}
    </div>
  );
}

/**
 * A `⋯` button — or, with `text`, a plain labelled button — that opens a small
 * menu panel with the same dismissal rules as a field popover.
 */
export function MenuButton({
  label,
  children,
  align = "right",
  direction = "down",
  text,
  className = "",
}: {
  label: string;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  /** `up` for a trigger that sits at the bottom of the screen (the bulk bar). */
  direction?: "up" | "down";
  /** Shown instead of the `⋯` glyph. */
  text?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        className={text ? className || "flex h-9 items-center rounded-sm px-2.5 text-body-sm font-medium text-ink-2 hover:bg-hover hover:text-ink" : "flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink sm:size-9"}
      >
        {text ?? <Icon name="more" size={18} strokeWidth={2.6} />}
      </button>
      {open && (
        <div id={panelId} role="menu" aria-label={label} className={`absolute z-30 flex w-64 flex-col gap-0.5 rounded-xl border border-raised-border bg-surface-3 p-2 shadow-raised ${direction === "up" ? "bottom-full mb-1" : "top-full mt-1"} ${align === "right" ? "right-0" : "left-0"}`}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

export const MENU_ITEM = "flex min-h-10 w-full items-center rounded-sm px-2.5 text-left text-body text-ink hover:bg-hover";
export const CHIP_BUTTON = "h-9 rounded-full border border-line px-3 text-body-sm text-ink hover:border-line-strong aria-pressed:border-ink aria-pressed:bg-surface-2";
/** The input used inside popover panels; the field primitive's look at the desktop height. */
export const FIELD_INPUT = fieldClass({ size: "desktop" });
