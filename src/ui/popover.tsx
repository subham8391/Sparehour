"use client";
// The ⋯ menu and the dismissal every popover shares (SCREENS.md §10): closes on
// Escape and on a click outside, and focus goes back to the trigger. The field
// row that opens a panel is field-popover.tsx. Panels are raised: surface-3
// with the ink shadow in light, a line-strong hairline and no shadow in dark
// (DESIGN_SYSTEM.md §4). Below `sm` a menu is a bottom sheet — scrim, grabber,
// sheet corners, the safe area — drawn over the tab bar and the FAB; from
// `sm` up it is a popover anchored to its trigger (DESIGN_SYSTEM.md §4a,
// §5 "Task row": the actions live in the ⋯ sheet on a phone).
import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { phoneWidth, useAnchoredPlacement, useDismiss } from "./anchor";
import { cx } from "./cx";
import { Icon } from "./icons";
import { Grabber, RAISED, SHEET_PANEL, SHEET_RISE, Scrim } from "./sheet-parts";

export { phoneWidth, useAnchoredPlacement, useDismiss, type DismissReason } from "./anchor";

/** A panel as a phone bottom sheet: scrim, grabber, sheet corners and the safe area, above the tab bar, the FAB and any open sheet. */
export function SheetFrame({ onClose, children, ...rest }: { onClose: () => void; children: ReactNode; [data: `data-${string}`]: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" {...rest}>
      <Scrim onClose={onClose} />
      <div className={cx(SHEET_PANEL, SHEET_RISE, "max-h-[85dvh]")}>
        <Grabber />
        {children}
      </div>
    </div>
  );
}

const ITEMS = "[role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox']";

/** The menu's items in order, the disabled ones skipped. */
function menuItems(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(ITEMS)).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-disabled") !== "true");
}

/** Arrows, Home and End move through a menu's items, a letter jumps to the next item starting with it, Tab leaves. */
function menuKeys(e: KeyboardEvent<HTMLElement>, onTab: () => void): void {
  const target = e.target as HTMLElement;
  if (!target.matches?.(ITEMS) && target !== e.currentTarget) return; // a field inside the menu keeps its keys
  const items = menuItems(e.currentTarget);
  if (items.length === 0) return;
  const at = items.indexOf(target);
  const go = (i: number) => {
    e.preventDefault();
    items[(i + items.length) % items.length]?.focus();
  };
  if (e.key === "ArrowDown") return go(at + 1);
  if (e.key === "ArrowUp") return go(at < 0 ? -1 : at - 1);
  if (e.key === "Home") return go(0);
  if (e.key === "End") return go(-1);
  if (e.key === "Tab") {
    e.preventDefault();
    onTab();
    return;
  }
  // Backspace and Delete are the app's Drop: never sent to the selected task from inside its menu.
  if (e.key === "Backspace" || e.key === "Delete") {
    e.preventDefault();
    return;
  }
  // A letter never reaches the app's own single-key commands while a menu is open.
  if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    const key = e.key.toLowerCase();
    const order = [...items.slice(at + 1), ...items.slice(0, at + 1)];
    order.find((el) => (el.textContent ?? "").trim().toLowerCase().startsWith(key))?.focus();
  }
}

/** What a caller can do to a menu from outside: the row's `.` key opens it, the day picker sits beside its trigger. */
export interface MenuHandle {
  open: () => void;
  trigger: () => HTMLButtonElement | null;
}

/**
 * A `⋯` button — or, with `text`, a plain labelled button — that opens a small
 * menu panel with the same dismissal rules as a field popover. Opening puts
 * focus on the first item; the arrows, Home and End move through the items
 * and a letter jumps to the next one starting with it; Escape, Tab, a choice
 * or a tap on the scrim closes it and hands focus back to the trigger.
 */
export function MenuButton({
  label,
  children,
  align = "right",
  direction = "down",
  text,
  className = "",
  portal = false,
  handle,
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
  /** From `sm` up, draw the popover at the end of the document, placed beside the trigger, so a masked or clipped parent (a task row's action zone) cannot hide it. */
  portal?: boolean;
  handle?: Ref<MenuHandle>;
}) {
  const [open, setOpen] = useState<false | "popover" | "sheet">(false);
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const panelId = useId();
  /** Everything that is this menu, wherever it is drawn: the panel, and the sheet's frame around it. */
  const mine = `[data-menu="${panelId}"]`;

  const close = useCallback(() => setOpen(false), []);
  const show = useCallback(() => setOpen(phoneWidth() ? "sheet" : "popover"), []);
  useImperativeHandle(handle, () => ({ open: show, trigger: () => trigger }), [show, trigger]);
  const rootRef = useDismiss(Boolean(open), close, mine);

  // Focus goes back to the trigger once the panel has gone, unless a choice sent it somewhere else (a field, a dialog).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const at = document.activeElement;
    if (!at || at === document.body) trigger?.focus({ preventScroll: true });
  }, [open, trigger]);

  const place = useAnchoredPlacement(open === "popover" && portal ? trigger : null, align, direction);
  // Focus moves in, to the first item (or the panel while the items are on their way); a portalled popover is placed.
  // Items that are swapped while it is open (a lazy group replacing its fallback) never drop focus on the page.
  const panelRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const first = () => (menuItems(el)[0] ?? el).focus({ preventScroll: true });
      first();
      const watch = typeof MutationObserver === "function" ? new MutationObserver(() => (!document.activeElement || document.activeElement === document.body) && first()) : null;
      watch?.observe(el, { childList: true, subtree: true });
      const unplace = place(el);
      return () => {
        watch?.disconnect();
        unplace?.();
      };
    },
    [place],
  );

  const list = (
    <div
      ref={panelRef}
      id={panelId}
      data-menu={panelId}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={(e) => menuKeys(e, close)}
      className={cx(
        "flex flex-col gap-0.5 outline-none",
        open === "sheet"
          ? "min-h-0 overflow-y-auto px-2 pt-1 pb-2"
          : cx(
              RAISED,
              "w-64 rounded-xl p-2",
              portal ? "fixed z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto" : cx("absolute z-30", direction === "up" ? "bottom-full mb-1" : "top-full mt-1", align === "right" ? "right-0" : "left-0"),
            ),
      )}
    >
      {children(close)}
    </div>
  );
  // A portalled panel is still inside its trigger's component for React: a tap in it must not reach a row around
  // the trigger (which would select it, or tick it on a long press).
  const contained = (node: ReactNode) => (
    <div className="contents" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {node}
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={setTrigger}
        type="button"
        onClick={() => (open ? close() : show())}
        aria-haspopup="menu"
        aria-expanded={Boolean(open)}
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        className={
          text
            ? className || "flex h-11 items-center rounded-sm px-2.5 text-body-sm font-medium text-ink-2 hover:bg-hover hover:text-ink sm:h-9 touch:h-11"
            : cx("flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink sm:size-9 touch:size-11", className)
        }
      >
        {text ?? <Icon name="more" size={18} strokeWidth={2.6} />}
      </button>
      {open === "sheet" &&
        createPortal(
          contained(
            <SheetFrame data-menu={panelId} onClose={close}>
              {list}
            </SheetFrame>,
          ),
          document.body,
        )}
      {open === "popover" && (portal ? createPortal(contained(list), document.body) : list)}
    </div>
  );
}

const MENU_ITEM_BASE = "flex w-full items-center rounded-sm px-2.5 text-left text-body max-sm:min-h-12 sm:min-h-10 touch:min-h-12";
/** A row inside a menu panel: 48 px on a phone and any touch device, 40 px from `sm` with a mouse (DESIGN_SYSTEM.md §4a). */
export const MENU_ITEM = `${MENU_ITEM_BASE} text-ink hover:bg-hover`;
/** The one destructive menu row: Delete and Disconnect only. Drop is undoable and stays ink (DESIGN_SYSTEM.md §2). */
export const MENU_ITEM_DESTRUCTIVE = `${MENU_ITEM_BASE} text-deadline hover:bg-deadline-soft`;
/** A hairline between a menu's groups (the row's own actions, then the snooze presets). */
export const MENU_SEPARATOR = "mx-2.5 my-1 h-px shrink-0 bg-line";
