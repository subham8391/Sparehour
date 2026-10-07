"use client";
// A block on the timeline and the toolbar of the selected one (SCREENS.md §2.6, §2.8, SYSTEM_DESIGN.md §11.5).
// The block is a real button, renamed in place by a double-click or the toolbar; its edges resize with a mouse.
// Every drag has a tap and a keyboard path here: the toolbar's Move… arms the timeline for a tap and opens a
// From / To pair of time fields (which resize too), Duplicate does the same for a copy, and Rename edits the
// title. Lives in the day pane's island, out of Today's first download.
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { formatMinutes, formatTime, timeFromMinutes } from "@/core/time";
import type { BlockDragData } from "@/features/blocking/drag";
import { minutesOfField } from "@/features/blocking/minutes";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { MENU_ITEM, MenuButton } from "@/ui/popover";
import { TimeField } from "@/ui/time-field";
import type { Lane } from "./overlap";
import type { TimelineBlock } from "./hooks/use-today";

/** A slot taller than this carries its time range on a second line. */
export const TWO_LINE_PX = 40;
/** A selected block's toolbar action: 44 px on touch, 28 px above, like every other row action. */
const TOOLBAR_ACTION = "flex h-11 shrink-0 items-center rounded-sm px-2 text-body-sm font-medium text-ink transition-colors dur-fast hover:bg-hover disabled:text-ink-3 sm:h-7";

export const hhmm = (m: number) => formatTime(timeFromMinutes(m));
/** "10:00–11:30 · 1h 30m" */
export const rangeLine = (start: number, end: number) => `${hhmm(start)}–${hhmm(end)} · ${formatMinutes(end - start)}`;

/** A block's horizontal slot: the full row, or its share of a cluster of overlapping blocks. */
export function laneStyle(lane: Lane | undefined): { left?: string; width?: string } {
  if (!lane || lane.columns <= 1) return {};
  const share = `(100% - 3.25rem - 0.5rem) / ${lane.columns}`;
  return { left: `calc(3.25rem + ${share} * ${lane.column})`, width: `calc(${share} - 3px)` };
}

/** What the toolbar's Move… or Duplicate is waiting for: a tap on the timeline, or a time typed. */
export type Armed = { kind: "move" | "copy"; id: string };

export function Block({
  block,
  lane,
  style,
  past,
  selected,
  movable,
  renaming,
  onSelect,
  onRename,
  onRenamed,
  onResizeStart,
}: {
  block: TimelineBlock;
  lane?: Lane;
  /** Where it is drawn: top and height in px. */
  style: { top: number; height: number };
  past: boolean;
  selected: boolean;
  movable: boolean;
  renaming: boolean;
  onSelect: () => void;
  /** Double-click: rename in place. */
  onRename?: () => void;
  /** The new name, or null when the edit was let go (Escape). */
  onRenamed: (title: string | null) => void;
  onResizeStart?: (edge: "start" | "end", e: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { id, start, end } = block;
  useEffect(() => {
    const el = ref.current;
    if (!el || !movable || renaming) return;
    return draggable({
      element: el,
      getInitialData: ({ input, element }): BlockDragData => ({ type: "block", id, duration: end - start, grabPx: input.clientY - element.getBoundingClientRect().top }),
    });
  }, [movable, renaming, id, start, end]);
  // Never shorter than a touch target (WCAG 2.5.8): a 15-minute block draws a little taller than its slot rather than unreachably thin.
  const height = Math.max(24, style.height - 2);
  const tall = height >= TWO_LINE_PX;
  const range = `${hhmm(start)} to ${hhmm(end)}`;
  // A finished task's block is done (PRODUCT_SPEC.md §10.2): let down like the past, with the check and the struck title of a completed row.
  const done = Boolean(block.done);
  const quiet = past || done;
  const cancelled = useRef(false);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelled.current = true;
      e.currentTarget.blur();
    }
  };
  return (
    <div
      ref={ref}
      data-block={id}
      data-done={done ? "true" : undefined}
      className={cx(
        "absolute right-2 left-13 rounded-sm border-l-[3px]",
        // The past is dimmed by a token mix, opaque so nothing beneath shows through.
        quiet ? "border-line-strong bg-[color-mix(in_oklab,var(--block-soft)_55%,var(--surface))]" : "border-block-fill bg-block-soft",
        movable && !renaming && "cursor-grab",
        selected && "outline-2 outline-offset-1 outline-ink",
      )}
      style={{ top: style.top + 1, height, ...laneStyle(lane) } as CSSProperties}
    >
      {renaming ? (
        <input
          // The rename was asked for (double-click, Rename, a new block): the field takes the caret at once.
          autoFocus
          aria-label="Block name"
          defaultValue={block.title}
          onFocus={(e) => {
            cancelled.current = false;
            e.currentTarget.select();
          }}
          onKeyDown={onKey}
          onBlur={(e) => onRenamed(cancelled.current ? null : e.currentTarget.value)}
          className="h-full w-full min-w-0 rounded-sm bg-transparent px-2 pl-2.5 text-label font-semibold text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          aria-label={`Block: ${block.title}, ${range}${done ? ", done" : ""}${block.locked ? ", locked" : ""}${block.sync === "will" ? ", will sync" : block.sync === "off" ? ", not synced" : ""}`}
          aria-pressed={selected}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          onDoubleClick={onRename}
          className={cx("h-full w-full overflow-hidden rounded-sm px-2 pl-2.5 text-left focus-visible:-outline-offset-2", tall ? "flex flex-col justify-start py-1" : "flex items-center gap-1.5")}
        >
          <span className={cx("flex min-w-0 items-center gap-1 text-label leading-[15px] font-semibold", quiet ? "text-ink-3" : "text-ink")}>
            {done && <Icon name="check" size={10} strokeWidth={2.2} className="shrink-0" />}
            {block.locked && <Icon name="lock" size={10} className="shrink-0" />}
            <span className={cx("truncate", done && "line-through")}>{block.title}</span>
            {/* "Will sync": a change still on its way (SCREENS.md §2.7, §20); hollow when it cannot sync at all (§21). */}
            {block.sync && <span aria-hidden="true" data-sync={block.sync} className={cx("size-1.5 shrink-0 rounded-full", block.sync === "will" ? "bg-ink-3" : "border border-ink-3")} />}
          </span>
          <span className={cx("block text-micro text-ink-2 num", tall ? "truncate" : "shrink-0 whitespace-nowrap")}>{tall ? rangeLine(start, end) : hhmm(start)}</span>
        </button>
      )}
      {/* Mouse affordances, hidden from assistive tech: the toolbar's From / To fields, the detail's and Shift+↑/↓ are the other ways (§11.5). */}
      {onResizeStart && !renaming && (
        <>
          <div aria-hidden="true" data-testid={`resize-top-${id}`} onPointerDown={(e) => onResizeStart("start", e)} className="absolute inset-x-0 -top-1 h-2 cursor-ns-resize" />
          <div aria-hidden="true" data-testid={`resize-${id}`} onPointerDown={(e) => onResizeStart("end", e)} className="absolute inset-x-0 -bottom-1 h-2 cursor-ns-resize" />
        </>
      )}
    </div>
  );
}

export interface ToolbarActions {
  onOpen?: () => void;
  /** Move… and Duplicate: arm the timeline for a tap, with the time fields open. */
  onArm?: (kind: Armed["kind"]) => void;
  onToggleLock?: () => void;
  onRemove?: () => void;
  onRename?: () => void;
  /** The From / To fields sent: a move keeping the length (only From changed), a resize, or where the copy goes. */
  onTimes?: (kind: Armed["kind"], from: number, to: number) => void;
  /** Escape in the time fields lets go of the waiting Move… or Duplicate. */
  onCancel?: () => void;
}

/**
 * The selected block's toolbar: Open, Move…, Lock and Remove, with Rename and Duplicate behind `⋯`. Drawn above
 * the block (below it near midnight), outside the block so nothing interactive is nested. While Move… or
 * Duplicate waits, it holds the From / To fields instead: a tap on the timeline still works.
 */
export function BlockToolbar({ block, top, below, armed, note, actions }: { block: TimelineBlock; top: number; below: boolean; armed: Armed["kind"] | null; note: string | null; actions: ToolbarActions }) {
  const ref = useRef<HTMLDivElement>(null);
  const [from, setFrom] = useState(hhmm(block.start));
  const [to, setTo] = useState(hhmm(block.end));
  const [seen, setSeen] = useState(`${armed}:${block.start}:${block.end}`);
  if (seen !== `${armed}:${block.start}:${block.end}`) {
    setSeen(`${armed}:${block.start}:${block.end}`);
    setFrom(hhmm(block.start));
    setTo(hhmm(block.end));
  }
  // Keep the toolbar on screen in a scrolled timeline; an armed one hands the caret to its first field.
  useEffect(() => {
    const el = ref.current;
    el?.scrollIntoView?.({ block: "nearest" });
    if (armed) el?.querySelector<HTMLInputElement>("input")?.focus();
  }, [armed]);
  const send = (e: FormEvent) => {
    e.preventDefault();
    const f = minutesOfField(from);
    const t = minutesOfField(to);
    if (f === null || !armed) return;
    // A new end resizes, from whatever start is shown; a new start alone moves the block, keeping its length,
    // earlier or later, overlapping where it was or not.
    const endChanged = armed === "move" && to !== hhmm(block.end) && t !== null;
    if (endChanged && t <= f) return;
    actions.onTimes?.(armed, f, endChanged ? t : f + (block.end - block.start));
  };
  return (
    <div
      ref={ref}
      data-testid="block-toolbar"
      className={cx("absolute right-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap items-center justify-end gap-0.5 rounded-lg border border-raised-border bg-surface-3 p-1 shadow-raised", below ? "mt-1" : "-translate-y-full -mt-1")}
      style={{ top }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {armed ? (
        <form
          onSubmit={send}
          onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), actions.onCancel?.())}
          className="flex flex-wrap items-center justify-end gap-1.5 px-1"
          aria-label={armed === "move" ? `Move ${block.title}` : `Copy ${block.title}`}
        >
          <label className="flex items-center gap-1 text-label text-ink-2">
            From
            <TimeField value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Start time" className="w-20" />
          </label>
          {armed === "move" && (
            <label className="flex items-center gap-1 text-label text-ink-2">
              To
              <TimeField value={to} onChange={(e) => setTo(e.target.value)} aria-label="End time" className="w-20" />
            </label>
          )}
          <button type="submit" className={TOOLBAR_ACTION}>
            {armed === "move" ? "Move" : "Copy"}
          </button>
        </form>
      ) : (
        <>
          {note && (
            <span role="status" className="px-2 text-body-sm text-ink-3">
              {note}
            </span>
          )}
          {actions.onOpen && (
            <button type="button" onClick={actions.onOpen} className={TOOLBAR_ACTION}>
              Open
            </button>
          )}
          {actions.onArm && (
            <button type="button" onClick={() => actions.onArm?.("move")} className={TOOLBAR_ACTION} aria-label={`Move ${block.title} to another time`}>
              Move…
            </button>
          )}
          {actions.onToggleLock && (
            <button type="button" onClick={actions.onToggleLock} className={TOOLBAR_ACTION}>
              {block.locked ? "Unlock" : "Lock"}
            </button>
          )}
          {actions.onRemove && (
            <button type="button" onClick={actions.onRemove} className={TOOLBAR_ACTION}>
              Remove
            </button>
          )}
          {(actions.onRename || actions.onArm) && (
            <MenuButton label="More block actions" portal className="size-11 sm:size-7">
              {(close) => (
                <>
                  {actions.onRename && (
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), actions.onRename?.())}>
                      Rename
                    </button>
                  )}
                  {actions.onArm && (
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), actions.onArm?.("copy"))}>
                      Duplicate
                    </button>
                  )}
                </>
              )}
            </MenuButton>
          )}
        </>
      )}
    </div>
  );
}

/** The bar over the timeline while something waits for a tap (SCREENS.md §2.8): what it is, and Cancel (or Escape). */
export function PlacingBar({ text, onCancel }: { text: string; onCancel: () => void }) {
  return (
    <div role="status" className="mb-3 flex min-h-11 items-center justify-between gap-3 rounded-lg bg-ink px-3 py-1.5 text-body-sm text-ink-inverse sm:min-h-9">
      <span className="min-w-0 truncate">{text}</span>
      <button type="button" onClick={onCancel} className="flex h-11 shrink-0 items-center rounded-sm px-2 font-medium underline decoration-ink-inverse/50 hover:decoration-ink-inverse sm:h-7">
        Cancel
      </button>
    </div>
  );
}
