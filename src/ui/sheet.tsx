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
import { useEffect, useRef, type HTMLAttributes, type KeyboardEvent } from "react";
import { cx } from "./cx";
import { Grabber, SHEET_PANEL, SHEET_RISE, Scrim, trapTab, useDialogFocus } from "./sheet-parts";

export { Grabber, RAISED, SHEET_PANEL, SHEET_RISE, Scrim, trapTab, useDialogFocus } from "./sheet-parts";

export type SheetAlign = "top" | "center";
export type SheetWidth = "sm" | "lg";

const WIDTH: Record<SheetWidth, string> = { sm: "sm:max-w-sm", lg: "sm:max-w-2xl" };

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
    // The side insets keep the panel clear of a landscape phone's notch and corners (DESIGN_SYSTEM.md §4a); zero in portrait.
    <div
      ref={frame}
      className={cx(
        "fixed inset-0 z-40 flex items-end pr-[env(safe-area-inset-right)] pb-[var(--kb,0px)] pl-[env(safe-area-inset-left)] sm:justify-center sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pl-[max(1.5rem,env(safe-area-inset-left))]",
        align === "top" ? "sm:items-start sm:pt-[12vh]" : "sm:items-center sm:pt-0",
      )}
    >
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
