"use client";
// The pieces of the overlay surface the shell itself draws with (DESIGN_SYSTEM.md §4, §7): the raised tone, the
// scrim, the grabber and the dialog's focus rules (SCREENS.md §1 rules 5 and 6). The Sheet that composes them is
// sheet.tsx, which re-exports these; the shell imports them from here so it does not carry the Sheet, which only
// lazy islands open (SYSTEM_DESIGN.md §11.6).
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cx } from "./cx";

/**
 * The one raised tone (DESIGN_SYSTEM.md §4): surface-3 with the ink shadow in
 * light, a line-strong hairline and no shadow in dark. Every popover, menu,
 * toast and sheet is drawn on it; the radius is the caller's.
 */
export const RAISED = "border border-raised-border bg-surface-3 shadow-raised";

/** The raised panel alone: a phone bottom sheet below `sm`, a dialog above it. */
export const SHEET_PANEL = `relative flex w-full min-w-0 flex-col ${RAISED} max-sm:rounded-t-sheet max-sm:pb-[env(safe-area-inset-bottom)] max-sm:shadow-sheet sm:rounded-xl`;

/** The phone sheet's entry: up from the bottom edge, 240 ms on the drawer curve; instant from `sm` up and under reduced motion. */
export const SHEET_RISE = "max-sm:transition-[translate,opacity] max-sm:dur-slow max-sm:ease-drawer max-sm:starting:translate-y-full max-sm:starting:opacity-0";

/**
 * The scrim: one tap closes. 80 ms in, so the dimming never flashes. It is out
 * of the tab order — every dialog already closes on Escape, and a keyboard
 * user should never land on a nameless wash of colour.
 */
export function Scrim({ onClose, className }: { onClose: () => void; className?: string }) {
  return <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className={cx("absolute inset-0 bg-scrim transition-opacity dur-reveal starting:opacity-0", className)} />;
}

/** The 36 by 4 handle at the top of a phone sheet. */
export function Grabber({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("mx-auto mt-2 mb-1 h-1 w-9 shrink-0 rounded-full bg-line-strong sm:hidden", className)} />;
}

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1']), [contenteditable='true']";

/** What Tab can reach inside `root`, in order; hidden elements are skipped. */
function focusables(root: HTMLElement): HTMLElement[] {
  // checkVisibility is missing before Safari 17.4 (and in jsdom): there, everything that matches counts.
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => (typeof el.checkVisibility === "function" ? el.checkVisibility() : true));
}

/**
 * The dialog's focus: in on open, kept in while open (back to the panel when
 * the focused control is taken out of it), back to the opener on close. The
 * opener is read while rendering, before a child's effect (quick-add focuses
 * its input) has moved focus into the sheet.
 */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(active = true) {
  const panel = useRef<T>(null);
  const [opener] = useState<HTMLElement | null>(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  useEffect(() => {
    const el = panel.current;
    if (!el || !active) return;
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    // Focus that lands behind the scrim (a click on the page, a script) comes back in; another dialog on top keeps
    // it, and so does a menu a row inside the dialog opened, its sheet's scrim included (drawn at the end of the
    // document, popover.tsx).
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || el.contains(target) || target.closest?.("[role='dialog'], [role='menu'], [data-menu]")) return;
      (focusables(el)[0] ?? el).focus({ preventScroll: true });
    };
    document.addEventListener("focusin", onFocusIn);
    // Focus whose control is taken out of the dialog (a task placed from a list inside it leaves that list) falls to
    // the page, where Escape and Tab no longer reach the dialog: it comes back to the panel.
    const dropped = typeof MutationObserver === "function" ? new MutationObserver(() => (!document.activeElement || document.activeElement === document.body) && el.focus({ preventScroll: true })) : null;
    dropped?.observe(el, { childList: true, subtree: true });
    return () => {
      dropped?.disconnect();
      document.removeEventListener("focusin", onFocusIn);
      const lost = !document.activeElement || document.activeElement === document.body || el.contains(document.activeElement);
      if (lost && opener?.isConnected && !el.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [opener, active]);
  return panel;
}

/** Tab and Shift+Tab wrap inside the dialog `e.currentTarget` instead of walking out behind its scrim. */
export function trapTab(e: KeyboardEvent<HTMLElement>): void {
  if (e.key !== "Tab") return;
  const items = focusables(e.currentTarget);
  if (items.length === 0) {
    e.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const at = document.activeElement;
  if (e.shiftKey && (at === first || at === e.currentTarget)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && at === last) {
    e.preventDefault();
    first.focus();
  }
}
