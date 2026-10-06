"use client";
// The actions a task row offers (DESIGN_SYSTEM.md §5 "Task row"). On a
// pointer device they sit in the row's action zone, pinned to its right edge
// over the chips, and appear on hover, focus-within and the J/K highlight;
// on a phone the same actions live in the
// row's "More actions" menu. One component, two layouts, told apart by the
// context the row provides, so every view keeps its accessible names.
import { createContext, useContext, type ReactNode } from "react";
import { BlockGlyph, Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon, type IconName } from "@/ui/icons";
import { MENU_ITEM } from "@/ui/popover";
import type { DayChip, DayChipTone } from "./day-chip";

export type RowActionsLayout = "inline" | "menu";

const LayoutContext = createContext<{ layout: RowActionsLayout; close?: () => void }>({ layout: "inline" });

/** Wraps the actions where the row renders them; `close` dismisses the phone menu after a choice. */
export function RowActionsLayoutProvider({ layout, close, children }: { layout: RowActionsLayout; close?: () => void; children: ReactNode }) {
  return <LayoutContext.Provider value={{ layout, close }}>{children}</LayoutContext.Provider>;
}

// 28 px in the desktop row's zone; 44 px wherever the inline layout shows on a phone (the morning plan's carried list).
const INLINE = "inline-flex h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-2 text-body-sm font-medium text-ink-2 transition-[background-color,color,transform] dur-fast hover:bg-hover hover:text-ink motion-safe:active:scale-97 sm:h-7";

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
  onClick: () => void;
}) {
  const { layout, close } = useContext(LayoutContext);
  const visual = glyph ?? (icon && <Icon name={icon} size={12} strokeWidth={2} className="shrink-0" />);
  if (layout === "menu") {
    const word = text && label.toLowerCase().includes(text.toLowerCase()) ? text : label;
    return (
      <button
        type="button"
        role="menuitem"
        aria-label={word !== label ? label : undefined}
        className={cx(MENU_ITEM, "gap-2.5")}
        onClick={() => {
          onClick();
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
    <button type="button" aria-label={iconOnly || text !== undefined ? label : undefined} title={title} onClick={onClick} className={cx(INLINE, iconOnly && "w-11 justify-center px-0 sm:w-7", primary && "text-ink")}>
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
  return layout === "menu" ? <>{children}</> : null;
}

/** The 7 px square that stands for a time block, in the current colour; drawn by the one glyph in `src/ui/chip`. */
export const BLOCK_GLYPH = <BlockGlyph />;

/** A day never looks like a duration: every day chip carries a glyph the estimate does not (DESIGN_SYSTEM.md §5). */
const DAY_GLYPH: Record<DayChipTone, IconName> = { neutral: "calendar", carried: "carry", parked: "moon" };

/**
 * The day chip on rows outside Today. A task row prints the carry count
 * itself, so a row that does asks with `count={false}` and the carried chip
 * steps aside rather than saying the same thing twice.
 */
export function DayChipTag({ chip, count = true }: { chip: DayChip | null; count?: boolean }) {
  if (!chip || (chip.tone === "carried" && !count)) return null;
  return (
    <Chip tone="time" size="auto" icon={chip.label === "Inbox" ? "inbox" : DAY_GLYPH[chip.tone]} className={chip.tone === "parked" ? "text-ink-3" : undefined}>
      {chip.label}
    </Chip>
  );
}

// 44 px on the phone, pulled into the panel's padding so it stays compact; 28 px beside the sentence on desktop.
const ASK_ACTION = "inline-flex h-11 items-center whitespace-nowrap rounded-sm px-2 text-body-sm font-medium transition-[background-color,color] dur-fast hover:bg-hover max-sm:-my-1.5 sm:h-7";

/**
 * The gentle ask in place of a row's actions once it has been carried over too many times (SCREENS.md §2.3): an
 * amber panel, never a red flag, with four answers always in this order — Keep today · Someday · Break it down ·
 * Drop — "Keep today" first because a no-penalty yes must exist. It sits under the title, clear of the ring.
 * "Break it down" converts the task into a project (PRODUCT_SPEC.md §8.3.3).
 */
export function CarryAsk({
  count,
  onKeep,
  onSomeday,
  onBreakDown,
  onDrop,
}: {
  count: number;
  onKeep: () => void;
  onSomeday?: () => void;
  onBreakDown?: () => void;
  onDrop?: () => void;
}) {
  return (
    <div role="group" aria-label="Still want this?" className="mx-3 mb-3 ml-14 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-sm border border-over-line bg-over-soft px-3 py-2 text-body-sm text-ink sm:mr-4 sm:ml-11 sm:px-3.5 sm:py-2.5 sm:text-body">
      <span>Carried over {count} times — still want this?</span>
      <span className="-ml-2 flex w-full flex-wrap items-center gap-x-1 sm:ml-auto sm:w-auto">
        <button type="button" className={cx(ASK_ACTION, "font-semibold text-over")} onClick={onKeep}>
          Keep today
        </button>
        {onSomeday && (
          <button type="button" className={cx(ASK_ACTION, "text-ink-2")} onClick={onSomeday}>
            Someday
          </button>
        )}
        {onBreakDown && (
          <button type="button" className={cx(ASK_ACTION, "text-ink-2")} onClick={onBreakDown}>
            Break it down
          </button>
        )}
        {onDrop && (
          <button type="button" className={cx(ASK_ACTION, "text-ink-2")} onClick={onDrop}>
            Drop
          </button>
        )}
      </span>
    </div>
  );
}
