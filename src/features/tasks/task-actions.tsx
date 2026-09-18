"use client";
// The actions a task row offers (DESIGN_SYSTEM.md §5 "Task row"). On a
// pointer device they sit in the row's reserved zone and appear on hover,
// focus-within and the J/K highlight; on a phone the same actions live in the
// row's "More actions" menu. One component, two layouts, told apart by the
// context the row provides, so every view keeps its accessible names.
import { createContext, useContext, type ReactNode } from "react";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon, type IconName } from "@/ui/icons";
import { MENU_ITEM } from "@/ui/popover";
import type { DayChip } from "./day-chip";

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
 * action). The menu always shows a word.
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
    const word = text ?? label;
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

/** The move actions shared by the inbox, carried-over, Someday and Upcoming lists. */
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

/** The 7 px square that stands for a time block, in the current colour. */
export const BLOCK_GLYPH = <span aria-hidden="true" className="size-[7px] shrink-0 rounded-[1.5px] bg-current" />;

/** The day chip on rows outside Today. A task row shows the carry count itself, so it asks for the carried chip without one. */
export function DayChipTag({ chip, count = true }: { chip: DayChip | null; count?: boolean }) {
  if (!chip) return null;
  return (
    <Chip tone={chip.tone === "carried" ? "over" : "neutral"} size="auto" className={chip.tone === "parked" ? "text-ink-3" : undefined}>
      {chip.tone === "carried" && !count ? "Carried" : chip.label}
    </Chip>
  );
}

// 44 px on the phone, pulled into the panel's padding so it stays compact; 28 px beside the sentence on desktop.
const ASK_ACTION = "inline-flex h-11 items-center whitespace-nowrap rounded-sm px-2 text-body-sm font-medium transition-[background-color,color] dur-fast hover:bg-hover max-sm:-my-1.5 sm:h-7";

/**
 * The gentle ask under a row carried over too many times (SCREENS.md §2.3):
 * an amber panel, never a red flag, with "Keep today" first because a
 * no-penalty yes must exist. It sits under the title, clear of the ring.
 */
export function CarryAsk({ count, onKeep, onSomeday, onDrop }: { count: number; onKeep: () => void; onSomeday?: () => void; onDrop?: () => void }) {
  return (
    <div className="mx-3 mb-3 ml-14 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-sm border border-over-line bg-over-soft px-3 py-2 text-body-sm text-ink sm:mr-4 sm:ml-11 sm:px-3.5 sm:py-2.5 sm:text-body">
      <span>Carried over {count} times — still want this?</span>
      <span className="-ml-2 flex w-full items-center gap-1 sm:ml-auto sm:w-auto">
        <button type="button" className={cx(ASK_ACTION, "font-semibold text-over")} onClick={onKeep}>
          Keep today
        </button>
        {onSomeday && (
          <button type="button" className={cx(ASK_ACTION, "text-ink-2")} onClick={onSomeday}>
            Someday
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
