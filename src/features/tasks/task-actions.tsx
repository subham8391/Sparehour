"use client";
// The actions a task row offers (DESIGN_SYSTEM.md §5 "Task row"). On a
// pointer device they sit in the row's action zone, pinned to its right edge
// over the chips, and appear on hover, focus-within and the J/K highlight;
// on a phone the same actions live in the
// row's "More actions" menu. One component, two layouts, told apart by the
// context the row provides, so every view keeps its accessible names.
import { createContext, useContext, type MouseEvent, type ReactNode } from "react";
import { BlockGlyph } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon, type IconName } from "@/ui/icons";
import { MENU_ITEM } from "@/ui/popover";

/** `swipe`: drawn nowhere, each action handing its handler to the row's swipe (swipe-layer.tsx), so a swipe runs exactly what the ⋯ item runs. */
export type RowActionsLayout = "inline" | "menu" | "swipe";

interface Layout {
  layout: RowActionsLayout;
  close?: () => void;
  /** Opens the row's day picker beside `anchor` (Move to…, Someday's Pick a date), named `label`. */
  move?: (anchor: HTMLElement | null, label?: string) => void;
  /** The swipe layout's sink for each action's label and handler. */
  register?: (label: string, run: () => void) => void;
}

const LayoutContext = createContext<Layout>({ layout: "inline" });

/** Wraps the actions where the row renders them; `close` dismisses the menu after a choice. */
export function RowActionsLayoutProvider({ layout, close, move, register, children }: Layout & { children: ReactNode }) {
  return <LayoutContext.Provider value={{ layout, close, move, register }}>{children}</LayoutContext.Provider>;
}

/** The row's layout, close and day picker, for the menu's own items (the snooze presets, Move to…). */
export function useRowActions(): Layout {
  return useContext(LayoutContext);
}

/** Labels a menu already offers in its own group (the snooze presets): a row action saying the same steps aside there. */
const OwnedContext = createContext<ReadonlySet<string> | null>(null);

export function OwnedLabels({ labels, children }: { labels: ReadonlySet<string>; children: ReactNode }) {
  return <OwnedContext.Provider value={labels}>{children}</OwnedContext.Provider>;
}

// 28 px in the desktop row's zone with a mouse; 44 px on a phone (the morning plan's carried list) and on any touch device.
const INLINE = "inline-flex h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-2 text-body-sm font-medium text-ink-2 transition-[background-color,color,transform] dur-fast hover:bg-hover hover:text-ink motion-safe:active:scale-97 sm:h-7 touch:h-11";

/**
 * One row action. `label` is its accessible name; `text` is what the row
 * shows beside the glyph (defaults to the label, `null` for an icon-only
 * action), and must be part of the label so what is seen is what is named
 * (WCAG 2.5.3): "Block" for "Block Draft the proposal". The menu always shows
 * a word, and has room for the whole one: a short text that is not part of
 * the label gives way to the label there.
 */
export function RowAction({
  label,
  text,
  icon,
  glyph,
  title,
  primary = false,
  onClick,
}: {
  label: string;
  text?: string | null;
  icon?: IconName;
  /** A drawn glyph that is not in the icon set (the block square). */
  glyph?: ReactNode;
  /** The pointer tooltip, with the shortcut when there is one: "Tomorrow (T)". */
  title?: string;
  /** The first, no-penalty choice reads in ink. */
  primary?: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { layout, close, register } = useContext(LayoutContext);
  const owned = useContext(OwnedContext);
  if (layout === "swipe") {
    register?.(label, onClick as () => void);
    return null;
  }
  const visual = glyph ?? (icon && <Icon name={icon} size={12} strokeWidth={2} className="shrink-0" />);
  if (layout === "menu") {
    if (owned?.has(label)) return null;
    const word = text && label.toLowerCase().includes(text.toLowerCase()) ? text : label;
    return (
      <button
        type="button"
        role="menuitem"
        aria-label={word !== label ? label : undefined}
        className={cx(MENU_ITEM, "gap-2.5")}
        onClick={(e) => {
          onClick(e);
          close?.();
        }}
      >
        {visual}
        {word}
      </button>
    );
  }
  const iconOnly = text === null;
  return (
    <button type="button" aria-label={iconOnly || text !== undefined ? label : undefined} title={title} onClick={onClick} className={cx(INLINE, iconOnly && "w-11 justify-center px-0 sm:w-7 touch:w-11", primary && "text-ink")}>
      {visual}
      {!iconOnly && (text ?? label)}
    </button>
  );
}

/**
 * The move actions shared by the inbox, carried-over, Someday and Upcoming
 * lists. Drop is undoable, so it reads in ink like the rest (ruling R2): the
 * destructive tone is for Delete and Disconnect only.
 */
export function MoveActions({
  onToday,
  onTomorrow,
  onSomeday,
  onDrop,
}: {
  onToday?: () => void;
  onTomorrow?: () => void;
  onSomeday?: () => void;
  onDrop?: () => void;
}) {
  return (
    <>
      {onToday && <RowAction label="Today" primary title="Today (T)" onClick={onToday} />}
      {onTomorrow && <RowAction label="Tomorrow" title="Tomorrow (Shift+T)" onClick={onTomorrow} />}
      {onSomeday && <RowAction label="Someday" title="Someday (S)" onClick={onSomeday} />}
      {onDrop && <RowAction label="Drop" title="Drop (Backspace)" onClick={onDrop} />}
    </>
  );
}

/**
 * Actions for the phone's row menu only, where a drag has no tap path otherwise (moving a task under another
 * heading). The inline zone on a pointer device keeps its few icons; the detail's Heading field serves every device.
 */
export function MenuOnly({ children }: { children: ReactNode }) {
  const { layout } = useContext(LayoutContext);
  return layout !== "inline" ? <>{children}</> : null;
}

/**
 * The row's day picker from its inline zone, beside the button (Someday's "Pick a date"). The menu has its own
 * "Move to…" for the same picker, so this one stays out of it.
 */
export function MoveToAction({ label = "Move to…", text, icon = "calendar", title }: { label?: string; text?: string | null; icon?: IconName; title?: string }) {
  const { layout, move } = useContext(LayoutContext);
  if (layout !== "inline" || !move) return null;
  return <RowAction label={label} text={text} icon={icon} title={title ?? label} onClick={(e) => move(e.currentTarget, label)} />;
}

/** The 7 px square that stands for a time block, in the current colour; drawn by the one glyph in `src/ui/chip`. */
export const BLOCK_GLYPH = <BlockGlyph />;
