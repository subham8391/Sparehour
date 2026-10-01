"use client";
// The one overlay surface every dialog shares (DESIGN_SYSTEM.md §4, §7): a
// scrim that fades in over 80 ms and a raised panel on surface-3. On a phone
// the panel is a bottom sheet with a grabber, sheet corners and the float
// shadow, sliding up in 240 ms on the drawer curve; from the narrow band up
// it is a centred dialog with the raised shadow that simply appears, as
// keyboard-driven things should. Reduced motion keeps the fades and drops
// the slide. The sheet owns the dialog's focus (SCREENS.md §1 rules 5 and 6):
// Tab stays inside it, Escape from anywhere in it closes it unless a child
// already handled the key, focus moves in when nothing inside has it, and it
// goes back to whatever opened the sheet when the sheet closes.
import { useEffect, useRef, useState, type HTMLAttributes, type KeyboardEvent } from "react";
import { cx } from "./cx";

export type SheetAlign = "top" | "center";
export type SheetWidth = "sm" | "lg";

const WIDTH: Record<SheetWidth, string> = { sm: "sm:max-w-sm", lg: "sm:max-w-2xl" };

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

/**
 * iOS lifts the visual viewport, not the layout one, when its keyboard opens,
 * so a sheet docked at the bottom would sit under the keys. The gap goes into
 * `--kb` on the frame, which pads itself by that much. Android and desktop
 * report no gap.
 */
function useKeyboardInset() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.setProperty("--kb", `${Math.round(inset)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return ref;
}

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1']), [contenteditable='true']";

/** What Tab can reach inside `root`, in order; hidden elements are skipped. */
function focusables(root: HTMLElement): HTMLElement[] {
  // checkVisibility is missing before Safari 17.4 (and in jsdom): there, everything that matches counts.
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => (typeof el.checkVisibility === "function" ? el.checkVisibility() : true));
}

/**
 * The dialog's focus: in on open, kept in while open, back to the opener on
 * close. The opener is read while rendering, before a child's effect (quick-add
 * focuses its input) has moved focus into the sheet.
 */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(active = true) {
  const panel = useRef<T>(null);
  const [opener] = useState<HTMLElement | null>(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  useEffect(() => {
    const el = panel.current;
    if (!el || !active) return;
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    // Focus that lands behind the scrim (a click on the page, a script) comes back in; another dialog on top keeps it.
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || el.contains(target) || target.closest?.("[role='dialog']")) return;
      (focusables(el)[0] ?? el).focus({ preventScroll: true });
    };
    document.addEventListener("focusin", onFocusIn);
    return () => {
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

export function Sheet({
  label,
  onClose,
  align = "top",
  width = "lg",
  className,
  children,
  onKeyDown,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "role"> & {
  /** The dialog's accessible name. */
  label: string;
  onClose: () => void;
  /** Where the dialog sits from `sm` up: under the top edge (quick-add, the palette) or centred (a short question). */
  align?: SheetAlign;
  width?: SheetWidth;
}) {
  const frame = useKeyboardInset();
  const panel = useDialogFocus();
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    trapTab(e);
  };
  return (
    <div ref={frame} className={cx("fixed inset-0 z-40 flex items-end pb-[var(--kb,0px)] sm:justify-center sm:px-6", align === "top" ? "sm:items-start sm:pt-[12vh]" : "sm:items-center sm:pt-0")}>
      <Scrim onClose={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={keys}
        className={cx(SHEET_PANEL, SHEET_RISE, WIDTH[width], "max-h-[calc(100dvh-1rem)] outline-none", className)}
        {...rest}
      >
        <Grabber />
        {children}
      </div>
    </div>
  );
}
