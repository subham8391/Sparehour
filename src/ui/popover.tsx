"use client";
// The ⋯ menu and the dismissal every popover shares (SCREENS.md §10): closes on
// Escape and on a click outside. The field row that opens a panel is
// field-popover.tsx. Panels are raised: surface-3 with the ink shadow in
// light, a line-strong hairline and no shadow in dark (DESIGN_SYSTEM.md §4).
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./icons";
import { RAISED } from "./sheet-parts";

/**
 * The dismissal both panels share: a click outside or Escape closes, and the
 * returned ref goes on the element that counts as "inside". The handler is
 * read from a ref, so a new closure on every render never re-subscribes.
 */
export function useDismiss(open: boolean, onDismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(onDismiss);
  useEffect(() => {
    latest.current = onDismiss;
  });
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) latest.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        latest.current();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
  return ref;
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
  /** Shown instead of the `⋯` glyph: a word, or a word beside a glyph. */
  text?: ReactNode;
  /** Added to the `⋯` trigger; on the `text` trigger it still replaces the default look, until the last caller moves to `buttonClass`. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  const rootRef = useDismiss(open, close);
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        className={
          text
            ? className || "flex h-11 items-center rounded-sm px-2.5 text-body-sm font-medium text-ink-2 hover:bg-hover hover:text-ink sm:h-9"
            : cx("flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink sm:size-9", className)
        }
      >
        {text ?? <Icon name="more" size={18} strokeWidth={2.6} />}
      </button>
      {open && (
        <div
          id={panelId}
          role="menu"
          aria-label={label}
          className={cx(RAISED, "absolute z-30 flex w-64 flex-col gap-0.5 rounded-xl p-2", direction === "up" ? "bottom-full mb-1" : "top-full mt-1", align === "right" ? "right-0" : "left-0")}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

const MENU_ITEM_BASE = "flex w-full items-center rounded-sm px-2.5 text-left text-body max-sm:min-h-12 sm:min-h-10";
/** A row inside a menu panel: 48 px on touch, 40 px from `sm` (DESIGN_SYSTEM.md §4a). */
export const MENU_ITEM = `${MENU_ITEM_BASE} text-ink hover:bg-hover`;
/** The one destructive menu row: Delete and Disconnect only. Drop is undoable and stays ink (DESIGN_SYSTEM.md §2). */
export const MENU_ITEM_DESTRUCTIVE = `${MENU_ITEM_BASE} text-deadline hover:bg-deadline-soft`;
