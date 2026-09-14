"use client";
// A field row that opens a small panel: the task detail's "each field opens a
// popover" (SCREENS.md §10). Closes on Escape and on a click outside; hands
// focus back to the row.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

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
        className="flex min-h-[46px] w-full items-center justify-between gap-3 px-3.5 text-left text-[14.5px] hover:bg-paper"
      >
        <span className="text-ink-2">{label}</span>
        <span className="flex min-w-0 items-center gap-2 text-ink">{value}</span>
      </button>
      {open && (
        <div id={panelId} role="dialog" aria-label={label} className="absolute right-2 top-full z-30 mt-1 w-[calc(100%-1rem)] max-w-80 rounded-xl border border-line bg-surface p-3 shadow-lg">
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
        className={text ? className || "flex h-9 items-center rounded-lg px-2.5 text-[13px] text-ink-2 hover:bg-paper hover:text-ink" : "flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-surface hover:text-ink sm:size-9"}
      >
        {text ?? (
          <span aria-hidden="true" className="text-lg leading-none">
            ⋯
          </span>
        )}
      </button>
      {open && (
        <div id={panelId} role="menu" aria-label={label} className={`absolute z-30 flex w-64 flex-col gap-0.5 rounded-xl border border-line bg-surface p-2 shadow-lg ${direction === "up" ? "bottom-full mb-1" : "top-full mt-1"} ${align === "right" ? "right-0" : "left-0"}`}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

export const MENU_ITEM = "flex min-h-10 w-full items-center rounded-lg px-2.5 text-left text-[14px] text-ink hover:bg-paper";
export const CHIP_BUTTON = "h-9 rounded-full border border-line px-3 text-[13px] text-ink hover:border-line-strong aria-pressed:border-ink aria-pressed:bg-surface-2";
export const FIELD_INPUT = "h-10 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink outline-none focus:border-ink";
