"use client";
// The one overlay surface every dialog shares (DESIGN_SYSTEM.md §4, §7): a
// scrim that fades in over 80 ms and a raised panel on surface-3. On a phone
// the panel is a bottom sheet with a grabber, sheet corners and the float
// shadow, sliding up in 240 ms on the drawer curve; from the narrow band up
// it is a centred dialog with the raised shadow that simply appears, as
// keyboard-driven things should. Reduced motion keeps the fades and drops
// the slide. Escape and focus are the caller's: every dialog already owns
// its own keys.
import { useEffect, useRef, type HTMLAttributes } from "react";
import { cx } from "./cx";

export type SheetAlign = "top" | "center";
export type SheetWidth = "sm" | "lg";

const WIDTH: Record<SheetWidth, string> = { sm: "sm:max-w-sm", lg: "sm:max-w-2xl" };

/** The raised panel alone: a phone bottom sheet below `sm`, a dialog above it. */
export const SHEET_PANEL =
  "relative flex w-full min-w-0 flex-col border border-raised-border bg-surface-3 max-sm:rounded-t-sheet max-sm:pb-[env(safe-area-inset-bottom)] max-sm:shadow-sheet sm:rounded-xl sm:shadow-raised";

/** The phone sheet's entry: up from the bottom edge, 240 ms on the drawer curve; instant from `sm` up and under reduced motion. */
export const SHEET_RISE = "max-sm:transition-[translate,opacity] max-sm:dur-slow max-sm:ease-drawer max-sm:starting:translate-y-full max-sm:starting:opacity-0";

/** The scrim: one tap closes. 80 ms in, so the dimming never flashes. */
export function Scrim({ onClose, className }: { onClose: () => void; className?: string }) {
  return <button type="button" aria-label="Close" onClick={onClose} className={cx("absolute inset-0 bg-scrim transition-opacity duration-[80ms] starting:opacity-0", className)} />;
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

export function Sheet({
  label,
  onClose,
  align = "top",
  width = "lg",
  className,
  children,
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
  return (
    <div ref={frame} className={cx("fixed inset-0 z-40 flex items-end pb-[var(--kb,0px)] sm:justify-center sm:px-6", align === "top" ? "sm:items-start sm:pt-[12vh]" : "sm:items-center sm:pt-0")}>
      <Scrim onClose={onClose} />
      <div role="dialog" aria-modal="true" aria-label={label} className={cx(SHEET_PANEL, SHEET_RISE, WIDTH[width], "max-h-[calc(100dvh-1rem)]", className)} {...rest}>
        <Grabber />
        {children}
      </div>
    </div>
  );
}
