"use client";
// The day timeline (DESIGN_SYSTEM.md §5 "Timeline", SCREENS.md §2.6): 66 px
// per hour, a 48 px ruler gutter with hour labels and quarter ticks, meetings
// (read-only, titled or "Busy"), blocks (draggable, resizable from the bottom
// edge, lockable), free gaps of half an hour or more named in spare, the
// now line with its gutter dot and time, the projected finish with its
// "done by" pill in the gutter, and the past dimmed by a token swap (a block
// whose task is finished too, struck through with a check). A task
// row dragged over it shows a ghost block snapped to five minutes; dropping
// creates the block. Blocks stay local until a write calendar exists (P7b).
// The drawn range is the working day with an hour either side, widened to
// whatever sits outside it and to now; the hours outside the work windows are
// dimmed but stay usable (SCREENS.md §2.6).
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { layoutLanes, type Lane } from "./overlap";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { blockLength, minuteAtOffset, placeAt, resizeEnd } from "@/core/blocking";
import type { Capacity, Interval } from "@/core/capacity";
import { subtract } from "@/core/capacity/intervals";
import { formatMinutes, formatTime, timeFromMinutes, type Instant } from "@/core/time";
import { asDragData, type BlockDragData } from "@/features/blocking/drag";
import type { PlanGhost } from "@/features/planning/drawing";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { minuteOnDay } from "./day-minute";
import type { TimelineBlock, TimelineMeeting } from "./hooks/use-today";

export const PX_PER_MIN = 1.1;
/** The padding drawn either side of the working day (SCREENS.md §2.6). */
const PAD_MIN = 60;
const DAY_MIN = 24 * 60;
/** A free gap shorter than this is not worth naming. */
const FREE_LABEL_MIN = 30;
/** A slot taller than this carries its time range on a second line. */
const TWO_LINE_PX = 40;
/** A selected block's toolbar action: 44 px on touch, 28 px above, like every other row action. */
const TOOLBAR_ACTION = "flex h-11 items-center rounded-sm px-2 text-body-sm font-medium text-ink transition-colors dur-fast hover:bg-hover sm:h-7";

export interface TimelineProps {
  c: Capacity;
  now: Instant;
  zone: string;
  blocks?: readonly TimelineBlock[];
  /** Names for the busy intervals; an interval with no single matching event reads "Busy". */
  meetings?: readonly TimelineMeeting[];
  defaultEstimateMin?: number;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string | null) => void;
  onDropTask?: (taskId: string, startMin: number) => void;
  onMoveBlock?: (id: string, startMin: number) => void;
  onResizeBlock?: (id: string, endMin: number) => void;
  onRemoveBlock?: (id: string) => void;
  onToggleLock?: (id: string, locked: boolean) => void;
  onOpenTask?: (taskId: string) => void;
  /** Tap-to-schedule (SCREENS.md §2.8): a task is waiting for a time; a tap on a free spot places it. */
  placing?: { title: string } | null;
  onTapSlot?: (startMin: number) => void;
  /** Plan my day's proposal while it is previewed: drawn as ghosts, never written (SYSTEM_DESIGN.md §5.5). */
  proposed?: readonly PlanGhost[];
  /** The start of a meeting clicked on the ribbon: outlined for a moment (SCREENS.md §2.2). */
  shownMeeting?: number | null;
}

interface Ghost {
  start: number;
  end: number;
  label: string;
}

/** "10:00–11:30 · 1h 30m" */
const rangeLine = (start: number, end: number) => `${formatTime(timeFromMinutes(start))}–${formatTime(timeFromMinutes(end))} · ${formatMinutes(end - start)}`;

/** The one event that fills a busy interval names it; two overlapping ones, or a private calendar, read "Busy". */
function meetingTitle(b: Interval, meetings: readonly TimelineMeeting[] | undefined): string {
  const inside = (meetings ?? []).filter((m) => m.start >= b.start && m.end <= b.end);
  return inside.length === 1 ? inside[0].title : "Busy";
}

/**
 * The stretch of the day the timeline draws (SCREENS.md §2.6): the working day plus an hour either side, widened
 * to take in everything drawn on it (a 07:30 block is allowed, PRODUCT_SPEC.md §10.2) and the now line, in whole
 * hours inside the day. Without working hours it falls back to 09:00–17:00, as the Today page does.
 */
export function drawnRange(windows: readonly Interval[], drawn: readonly Interval[], nowMin: number | null): Interval {
  let start = (windows[0]?.start ?? 9 * 60) - PAD_MIN;
  let end = (windows[windows.length - 1]?.end ?? 17 * 60) + PAD_MIN;
  for (const d of drawn) {
    start = Math.min(start, d.start);
    end = Math.max(end, d.end);
  }
  if (nowMin !== null) {
    start = Math.min(start, nowMin);
    end = Math.max(end, nowMin);
  }
  return { start: Math.max(0, Math.floor(start / 60) * 60), end: Math.min(DAY_MIN, Math.ceil(end / 60) * 60) };
}

export function Timeline(p: TimelineProps) {
  const { c, now, zone } = p;
  const workEnd = c.windows[c.windows.length - 1]?.end ?? 17 * 60;
  const { minute: nowMin, onDay: nowShown } = minuteOnDay(now, zone, c.day);
  const { start, end } = drawnRange(c.windows, [...(p.blocks ?? []), ...c.busy, ...(p.proposed ?? [])], nowShown ? nowMin : null);
  const y = (m: number) => (m - start) * PX_PER_MIN;
  // Whatever overlaps shares the width side by side (SCREENS.md §4), a block dropped on a meeting included, so each stays readable and reachable.
  const lanes = layoutLanes([...(p.blocks ?? []), ...c.busy.map((b, i) => ({ id: `m${i}`, ...b }))]);
  // Where the day stands: before it starts nothing is past, after it ends everything is.
  const elapsed = Math.min(Math.max(nowMin, start), end);
  // The hours outside the work windows, the padding and the gap between split windows included: dimmed, still usable.
  const outside = subtract([{ start, end }], c.windows);
  const finishMin = c.projectedFinish ? c.projectedFinish.hour * 60 + c.projectedFinish.minute : null;
  const rootRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [resizing, setResizing] = useState<{ id: string; end: number } | null>(null);

  // The latest handlers, so the drop target registers once per timeline.
  const propsRef = useRef(p);
  useEffect(() => {
    propsRef.current = p;
  });
  const accepts = Boolean(p.onDropTask || p.onMoveBlock);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !accepts) return;
    const minuteAt = (clientY: number, grabPx = 0) => minuteAtOffset(clientY - root.getBoundingClientRect().top - grabPx, PX_PER_MIN, start);
    const ghostFor = (data: Record<string, unknown>, clientY: number): Ghost | null => {
      const d = asDragData(data);
      if (!d) return null;
      if (d.type === "task") {
        const len = blockLength(d.estimateMin, propsRef.current.defaultEstimateMin ?? 30);
        return { ...placeAt(minuteAt(clientY), len), label: d.title };
      }
      return { ...placeAt(minuteAt(clientY, d.grabPx), d.duration), label: "" };
    };
    return dropTargetForElements({
      element: root,
      canDrop: ({ source }) => asDragData(source.data) !== null,
      onDrag: ({ source, location }) => {
        const next = ghostFor(source.data, location.current.input.clientY);
        setGhost((prev) => (prev && next && prev.start === next.start && prev.end === next.end && prev.label === next.label ? prev : next));
      },
      onDragLeave: () => setGhost(null),
      onDrop: ({ source, location }) => {
        setGhost(null);
        const d = asDragData(source.data);
        const at = ghostFor(source.data, location.current.input.clientY);
        if (!d || !at) return;
        if (d.type === "task") propsRef.current.onDropTask?.(d.id, at.start);
        else propsRef.current.onMoveBlock?.(d.id, at.start);
      },
    });
  }, [accepts, start]);

  const beginResize = (block: TimelineBlock) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const root = rootRef.current;
    if (!root || block.locked) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const endAt = (clientY: number) => resizeEnd(block, minuteAtOffset(clientY - root.getBoundingClientRect().top, PX_PER_MIN, start)).end;
    const move = (ev: globalThis.PointerEvent) => setResizing({ id: block.id, end: endAt(ev.clientY) });
    const up = (ev: globalThis.PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setResizing(null);
      propsRef.current.onResizeBlock?.(block.id, endAt(ev.clientY));
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const onTap = (e: ReactMouseEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (p.placing && p.onTapSlot && root) {
      p.onTapSlot(minuteAtOffset(e.clientY - root.getBoundingClientRect().top, PX_PER_MIN, start));
      return;
    }
    p.onSelectBlock?.(null);
  };

  // The ruler: an hour line and label per hour, a fainter line at the half hour, 4 px ticks at the quarters.
  // A label within reach of the now time or the done-by pill gives way to it.
  const hours = Array.from({ length: Math.floor((end - start) / 60) + 1 }, (_, i) => start + i * 60);
  const labelHidden = (m: number) => (nowShown && Math.abs(m - nowMin) <= 12) || (finishMin !== null && Math.abs(m - finishMin) <= 14);
  // Free gaps of half an hour or more are content: named in spare, and the tap-to-schedule targets. The part already gone is not free.
  const gaps = c.free.map((g) => ({ start: Math.max(g.start, elapsed), end: g.end })).filter((g) => g.end - g.start >= FREE_LABEL_MIN);

  return (
    <div
      ref={rootRef}
      className={cx("relative select-none", p.placing && "cursor-crosshair")}
      style={{ height: (end - start) * PX_PER_MIN }}
      data-testid="timeline"
      data-placing={p.placing ? "true" : undefined}
      aria-label={p.placing ? `Tap a time for ${p.placing.title}` : undefined}
      onClick={onTap}
    >
      {/* Under the grid: the page's own paper shows through where the working day is not, a step down from the surface in either theme. */}
      {outside.map((o) => (
        <div key={`o${o.start}`} aria-hidden="true" data-testid="outside-hours" className="pointer-events-none absolute right-0 left-12 bg-paper/80" style={{ top: y(o.start), height: (o.end - o.start) * PX_PER_MIN }} />
      ))}
      {hours.map((h) => (
        <div key={h} className="pointer-events-none absolute inset-x-0" style={{ top: y(h) }}>
          <div className="absolute top-0 right-0 left-12 border-t border-line" />
          {!labelHidden(h) && <span className="absolute -top-[7px] left-0 w-10 text-micro font-medium text-ink-3 num">{formatTime(timeFromMinutes(h))}</span>}
          {h + 30 <= end && <div className="absolute right-0 left-12 border-t border-line opacity-55" style={{ top: 30 * PX_PER_MIN }} />}
          {[15, 30, 45].map((q) => h + q <= end && <span key={q} className="absolute left-11 h-px w-1 bg-line-strong" style={{ top: q * PX_PER_MIN }} />)}
        </div>
      ))}
      {gaps.map((g, i) => (
        <div
          key={`f${i}`}
          className="pointer-events-none absolute right-2 left-13 flex items-center justify-center rounded-sm bg-spare-soft/45 text-label font-semibold text-spare num"
          style={{ top: y(g.start) + 1, height: (g.end - g.start) * PX_PER_MIN - 2 }}
        >
          {formatMinutes(g.end - g.start)} free{finishMin !== null && g.start >= finishMin && " · after the plan"}
        </div>
      ))}
      {c.busy.map((b, i) => {
        const height = Math.max(14, (b.end - b.start) * PX_PER_MIN - 2);
        const past = b.end <= elapsed;
        const tall = height >= TWO_LINE_PX;
        return (
          <div
            key={`m${i}`}
            data-meeting={b.start}
            className={cx(
              "absolute right-2 left-13 overflow-hidden rounded-sm border-l-[3px] px-2 pl-2.5",
              tall ? "py-1" : "flex items-center gap-1.5",
              past ? "border-meet-line bg-[color-mix(in_oklab,var(--meet-soft)_55%,var(--surface))]" : "border-meet-fill bg-meet-soft",
              p.shownMeeting === b.start && "outline-2 outline-offset-1 outline-meet-fill",
            )}
            style={{ top: y(b.start) + 1, height, ...laneStyle(lanes.get(`m${i}`)) }}
          >
            <span className="block min-w-0 truncate text-label leading-[15px] font-semibold text-meet">{meetingTitle(b, p.meetings)}</span>
            {/* On one line the time keeps its shape and the title gives way. */}
            <span className={cx("block text-micro text-meet num", tall ? "truncate" : "shrink-0 whitespace-nowrap")}>{tall ? rangeLine(b.start, b.end) : formatTime(timeFromMinutes(b.start))}</span>
          </div>
        );
      })}
      {(p.blocks ?? []).map((b) => (
        <Block
          key={b.id}
          block={resizing?.id === b.id ? { ...b, end: resizing.end } : b}
          lane={lanes.get(b.id)}
          top={y}
          past={b.end <= elapsed}
          selected={p.selectedBlockId === b.id}
          movable={Boolean(p.onMoveBlock) && !b.locked}
          onSelect={() => p.onSelectBlock?.(b.id)}
          onRemove={p.onRemoveBlock ? () => p.onRemoveBlock?.(b.id) : undefined}
          onToggleLock={p.onToggleLock ? () => p.onToggleLock?.(b.id, !b.locked) : undefined}
          onOpenTask={b.taskId && p.onOpenTask ? () => p.onOpenTask?.(b.taskId as string) : undefined}
          onResizeStart={p.onResizeBlock && !b.locked ? beginResize(b) : undefined}
        />
      ))}
      {/* Proposed blocks: a dashed block-fill outline over a thin block wash, so they read as blocks that are not there yet.
          The preview panel lists each one with its time and reason, so the drawing is hidden from assistive tech. */}
      {(p.proposed ?? []).map((g) => {
        const height = Math.max(24, (g.end - g.start) * PX_PER_MIN - 2);
        const tall = height >= TWO_LINE_PX;
        return (
          <div
            key={`plan-${g.key}`}
            aria-hidden="true"
            data-testid="plan-ghost"
            data-plan-ghost={g.key}
            className={cx(
              "pointer-events-none absolute right-2 left-13 scroll-mt-14 overflow-hidden rounded-sm border-[1.5px] border-dashed border-block-fill bg-block-soft/60 px-2",
              tall ? "flex flex-col justify-start py-1" : "flex items-center gap-1.5",
            )}
            style={{ top: y(g.start) + 1, height }}
          >
            <span className="block min-w-0 truncate text-label leading-[15px] font-semibold text-ink">{g.title}</span>
            <span className={cx("block text-micro text-ink-2 num", tall ? "truncate" : "shrink-0 whitespace-nowrap")}>{tall ? rangeLine(g.start, g.end) : formatTime(timeFromMinutes(g.start))}</span>
          </div>
        );
      })}
      {ghost && (
        <div className="pointer-events-none absolute right-2 left-13 flex items-center gap-1.5 overflow-hidden rounded-sm border border-dashed border-line-strong bg-surface/80 px-2 text-label text-ink-2" style={{ top: y(ghost.start) + 1, height: Math.max(12, (ghost.end - ghost.start) * PX_PER_MIN - 2) }}>
          <span className="num">{formatTime(timeFromMinutes(ghost.start))}</span>
          <span className="truncate">{ghost.label}</span>
        </div>
      )}
      {/* The working day's end, a shade firmer than an hour line. */}
      <div className="pointer-events-none absolute right-0 left-12 border-t border-line-strong" style={{ top: y(workEnd) }} />
      {finishMin !== null && finishMin >= start && finishMin <= end && (
        <>
          <div className="pointer-events-none absolute right-0 left-12 z-2 border-t-[1.5px] border-dashed border-spare-fill" style={{ top: y(finishMin) }} />
          <Chip tone="spare" size="sm" className="pointer-events-none absolute left-0 z-4 px-2" style={{ top: y(finishMin) - 10 }}>
            done by {formatTime(c.projectedFinish!)}
          </Chip>
        </>
      )}
      {nowShown && (
        <>
          <span className="pointer-events-none absolute left-0 z-3 w-10 text-micro font-semibold text-ink num" style={{ top: y(nowMin) - 7 }}>
            {formatTime(timeFromMinutes(nowMin))}
          </span>
          <div className="pointer-events-none absolute right-0 left-10 z-3 border-t-2 border-ink" style={{ top: y(nowMin) - 1 }}>
            <span className="absolute -top-[5.5px] left-0 size-[9px] rounded-full bg-ink" />
          </div>
        </>
      )}
    </div>
  );
}

/** A block's horizontal slot: the full row, or its share of a cluster of overlapping blocks. */
function laneStyle(lane: Lane | undefined): { left?: string; width?: string } {
  if (!lane || lane.columns <= 1) return {};
  const share = `(100% - 3.25rem - 0.5rem) / ${lane.columns}`;
  return { left: `calc(3.25rem + ${share} * ${lane.column})`, width: `calc(${share} - 3px)` };
}

function Block({
  block,
  lane,
  top,
  past,
  selected,
  movable,
  onSelect,
  onRemove,
  onToggleLock,
  onOpenTask,
  onResizeStart,
}: {
  block: TimelineBlock;
  lane?: Lane;
  top: (m: number) => number;
  past: boolean;
  selected: boolean;
  movable: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  onToggleLock?: () => void;
  onOpenTask?: () => void;
  onResizeStart?: (e: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { id, start, end } = block;
  useEffect(() => {
    const el = ref.current;
    if (!el || !movable) return;
    return draggable({
      element: el,
      getInitialData: ({ input, element }): BlockDragData => ({ type: "block", id, duration: end - start, grabPx: input.clientY - element.getBoundingClientRect().top }),
    });
  }, [movable, id, start, end]);
  // Never shorter than a touch target (WCAG 2.5.8): a 15-minute block draws a little taller than its slot rather than unreachably thin.
  const height = Math.max(24, (end - start) * PX_PER_MIN - 2);
  const tall = height >= TWO_LINE_PX;
  const range = `${formatTime(timeFromMinutes(start))} to ${formatTime(timeFromMinutes(end))}`;
  // A finished task's block is done (PRODUCT_SPEC.md §10.2): let down like the past, with the check and the struck title of a completed row.
  const done = Boolean(block.done);
  const quiet = past || done;
  // The block is a real button; the toolbar and the resize handle sit beside
  // it, never inside it, so nothing interactive is nested (§11.5).
  return (
    <div
      ref={ref}
      data-done={done ? "true" : undefined}
      className={cx(
        "absolute right-2 left-13 rounded-sm border-l-[3px]",
        // The past is dimmed by a token mix, opaque so nothing beneath shows through.
        quiet ? "border-line-strong bg-[color-mix(in_oklab,var(--block-soft)_55%,var(--surface))]" : "border-block-fill bg-block-soft",
        movable && "cursor-grab",
        selected && "outline-2 outline-offset-1 outline-ink",
      )}
      style={{ top: top(start) + 1, height, ...laneStyle(lane) }}
    >
      <button
        type="button"
        aria-label={`Block: ${block.title}, ${range}${done ? ", done" : ""}${block.locked ? ", locked" : ""}`}
        aria-pressed={selected}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onDoubleClick={onOpenTask}
        className={cx("h-full w-full overflow-hidden rounded-sm px-2 pl-2.5 text-left focus-visible:-outline-offset-2", tall ? "flex flex-col justify-start py-1" : "flex items-center gap-1.5")}
      >
        <span className={cx("flex min-w-0 items-center gap-1 text-label leading-[15px] font-semibold", quiet ? "text-ink-3" : "text-ink")}>
          {done && <Icon name="check" size={10} strokeWidth={2.2} className="shrink-0" />}
          {block.locked && <Icon name="lock" size={10} className="shrink-0" />}
          <span className={cx("truncate", done && "line-through")}>{block.title}</span>
        </span>
        <span className={cx("block text-micro text-ink-2 num", tall ? "truncate" : "shrink-0 whitespace-nowrap")}>{tall ? rangeLine(start, end) : formatTime(timeFromMinutes(start))}</span>
      </button>
      {selected && (
        <div className="absolute right-0 bottom-full z-10 mb-1 flex gap-0.5 rounded-lg border border-raised-border bg-surface-3 p-1 shadow-raised" onClick={(e) => e.stopPropagation()}>
          {onOpenTask && (
            <button type="button" onClick={onOpenTask} className={TOOLBAR_ACTION}>
              Open
            </button>
          )}
          {onToggleLock && (
            <button type="button" onClick={onToggleLock} className={TOOLBAR_ACTION}>
              {block.locked ? "Unlock" : "Lock"}
            </button>
          )}
          {onRemove && (
            <button type="button" onClick={onRemove} className={TOOLBAR_ACTION}>
              Remove
            </button>
          )}
        </div>
      )}
      {/* A mouse-only affordance, hidden from assistive tech: the accessible way to resize is the detail sheet (§11.5, "a tap path for every drag"). */}
      {onResizeStart && <div aria-hidden="true" data-testid={`resize-${id}`} onPointerDown={onResizeStart} className="absolute inset-x-0 -bottom-1 h-2 cursor-ns-resize" />}
    </div>
  );
}
