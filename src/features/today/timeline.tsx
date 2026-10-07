"use client";
// The day timeline (DESIGN_SYSTEM.md §5 "Timeline", SCREENS.md §2.6): 66 px per hour at the default zoom, with
// `+` / `-` (and a − / + control) stepping to 15- and 5-minute rows; a 48 px ruler gutter with hour labels; meetings
// (read-only, titled or "Busy"); blocks (draggable, resizable from either edge, lockable, renamed by a double-click,
// copied by Alt+drag); free gaps of half an hour or more named in spare; the now line; the projected finish with
// its "done by" pill, or, when the plan runs over, a marker pinned at the day's end; and the past dimmed by a
// token swap (a block whose task is finished too, struck through with a check). A task row dragged over it shows
// a ghost block snapped to five minutes; dropping creates the block. A drag on empty space draws a block of your
// own snapped to fifteen; on touch a tap there offers "New block here". Every drag has a tap and a keyboard path:
// the selected block's toolbar (block-tools.tsx) and its keys — L locks, Backspace removes, Enter opens, Shift+↑/↓
// resizes, Escape lets go. The whole 24 hours scroll, opening on the working day; the hours outside the work
// windows are dimmed but stay usable (SCREENS.md §2.6).
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { blockLength, drawnBlock, minuteAtOffset, placeAt, pxPerMinute, resizeEnd, resizeStart, stepZoom, ZOOM_STEPS, type ZoomStep } from "@/core/blocking";
import type { Capacity, Interval } from "@/core/capacity";
import { subtract } from "@/core/capacity/intervals";
import { formatMinutes, formatTime, timeFromMinutes, type Instant } from "@/core/time";
import { asDragData } from "@/features/blocking/drag";
import type { PlanGhost } from "@/features/planning/drawing";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import type { MenuHandle } from "@/ui/popover";
import { Block, BlockToolbar, INSET, PlacingBar, TWO_LINE_PX, hhmm, laneStyle, rangeLine, type Armed } from "./block-tools";
import { minuteOnDay } from "./day-minute";
import type { TimelineBlock, TimelineMeeting } from "./hooks/use-today";
import { layoutLanes } from "./overlap";
import { registerTimeline } from "./timeline-request";

export { PlacingBar } from "./block-tools";

/** The default scale, the 30-minute zoom step: 66 px per hour (DESIGN_SYSTEM.md §5). */
export const PX_PER_MIN = 1.1;
/** The padding drawn either side of the working day (SCREENS.md §2.6). */
const PAD_MIN = 60;
const DAY_MIN = 24 * 60;
/** A free gap shorter than this is not worth naming. */
const FREE_LABEL_MIN = 30;
/** How far a pointer goes on empty space before it is drawing a block rather than clicking. */
const DRAW_PX = 6;
/** "New block here" on touch: half an hour (PRODUCT_SPEC.md §10.2). */
const TAP_BLOCK_MIN = 30;

// ---- the zoom, one per device (SCREENS.md §2.6), shared by every timeline on screen
const ZOOM_KEY = "sparehour:timeline-zoom";
let zoomNow: ZoomStep | null = null;
const zoomListeners = new Set<() => void>();
function readZoom(): ZoomStep {
  if (zoomNow !== null) return zoomNow;
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    zoomNow = (ZOOM_STEPS as readonly number[]).includes(v) ? (v as ZoomStep) : 30;
  } catch {
    zoomNow = 30;
  }
  return zoomNow;
}
export function setZoom(step: ZoomStep): void {
  zoomNow = step;
  try {
    localStorage.setItem(ZOOM_KEY, String(step));
  } catch {
    // storage unavailable: the zoom holds for this visit
  }
  for (const l of zoomListeners) l();
}
const subscribeZoom = (l: () => void) => {
  zoomListeners.add(l);
  return () => void zoomListeners.delete(l);
};
const defaultZoom = (): ZoomStep => 30;
/** The zoom every timeline on screen shares, for whatever draws beside them (the Calendar's ruler). */
export const useTimelineZoom = (): ZoomStep => useSyncExternalStore(subscribeZoom, readZoom, defaultZoom);

/**
 * Left edges inside the timeline, from the ruler gutter (`--tl-g`, 3 rem, none in a grid column): the hour lines and
 * the dimmed hours start at it, everything drawn on the day a quarter rem inside it. Inline, so the app-wide
 * stylesheet every shell loads gains nothing.
 */
const AT_GUTTER = { left: "var(--tl-g)" };
const INSIDE = { left: INSET };

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
  /** A block moved by a drag, a tap after Move… or its From field: it keeps its length. */
  onMoveBlock?: (id: string, startMin: number) => void;
  /** New edges, from either end (a drag on an edge, Shift+↑/↓, the From / To fields). */
  onResizeBlock?: (id: string, startMin: number, endMin: number) => void;
  /** A copy at a new time: Alt+drag, or Duplicate then a tap or a time. */
  onDuplicateBlock?: (id: string, startMin: number) => void;
  onRemoveBlock?: (id: string) => void;
  onToggleLock?: (id: string, locked: boolean) => void;
  onOpenTask?: (taskId: string) => void;
  onRenameBlock?: (id: string, title: string) => void;
  /** An ad-hoc block: drawn on empty space, or "New block here". Resolves to its id, which then opens for a name. */
  onCreateBlock?: (startMin: number, endMin: number) => Promise<string | null>;
  /** Tap-to-schedule (SCREENS.md §2.8): a task is waiting for a time; a tap on a free spot places it. */
  placing?: { title: string } | null;
  onTapSlot?: (startMin: number) => void;
  /** Plan my day's proposal while it is previewed: drawn as ghosts, never written (SYSTEM_DESIGN.md §5.5). */
  proposed?: readonly PlanGhost[];
  /** The start of a meeting clicked on the ribbon: outlined for a moment (SCREENS.md §2.2). */
  shownMeeting?: number | null;
  /** Today's day pane scrolls itself from the wide band; below it, and everywhere else, the timeline scrolls in its own box. */
  paneScrolls?: boolean;
  /**
   * One day among several (the Calendar's grid, SCREENS.md §4): no ruler gutter, no zoom control and no scroll box of
   * its own — the grid draws one ruler and one zoom for every column and scrolls them together.
   */
  column?: boolean;
}

interface Ghost {
  start: number;
  end: number;
  label: string;
}

/** The one event that fills a busy interval names it; two overlapping ones, or a private calendar, read "Busy". */
function meetingTitle(b: Interval, meetings: readonly TimelineMeeting[] | undefined): string {
  const inside = (meetings ?? []).filter((m) => m.start >= b.start && m.end <= b.end);
  return inside.length === 1 ? inside[0].title : "Busy";
}

/**
 * Where the timeline opens (SCREENS.md §2.6): the working day plus an hour either side, widened to take in
 * everything drawn on it (a 07:30 block is allowed, PRODUCT_SPEC.md §10.2) and the now line, in whole hours
 * inside the day. Without working hours it falls back to 09:00–17:00, as the Today page does. The whole day
 * scrolls; this is the stretch it opens on.
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

/** The element that scrolls the timeline: its own box, or the pane around it. */
function scrollerOf(el: HTMLElement | null): HTMLElement | null {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

export function Timeline(p: TimelineProps) {
  const { c, now, zone } = p;
  const zoom = useTimelineZoom();
  const scale = pxPerMinute(zoom);
  const workEnd = c.windows[c.windows.length - 1]?.end ?? 17 * 60;
  const { minute: nowMin, onDay: nowShown } = minuteOnDay(now, zone, c.day);
  // The whole day is drawn; it opens on the working day (and whatever sits around it).
  const start = 0;
  const end = DAY_MIN;
  const opening = drawnRange(c.windows, [...(p.blocks ?? []), ...c.busy, ...(p.proposed ?? [])], nowShown ? nowMin : null);
  const y = (m: number) => (m - start) * scale;
  // Whatever overlaps shares the width side by side (SCREENS.md §4), a block dropped on a meeting included, so each stays readable and reachable.
  const lanes = layoutLanes([...(p.blocks ?? []), ...c.busy.map((b, i) => ({ id: `m${i}`, ...b }))]);
  // Where the day stands: before it starts nothing is past, after it ends everything is.
  const elapsed = Math.min(Math.max(nowMin, start), end);
  // The hours outside the work windows, the gap between split windows included: dimmed, still usable.
  const outside = subtract([{ start, end }], c.windows);
  const finishMin = c.projectedFinish ? c.projectedFinish.hour * 60 + c.projectedFinish.minute : null;
  const boxRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [resizing, setResizing] = useState<{ id: string; start: number; end: number } | null>(null);
  const [drawing, setDrawing] = useState<Interval | null>(null);
  const [offer, setOffer] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [armed, setArmed] = useState<Armed | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const suppressClick = useRef(false);
  const lastPointer = useRef<string>("mouse");
  // A right-click selects the block and opens its menu, once its toolbar is drawn.
  const menuRef = useRef<MenuHandle>(null);
  const menuFor = useRef<string | null>(null);

  const blocks = p.blocks ?? [];
  const selected = blocks.find((b) => b.id === p.selectedBlockId) ?? null;
  const armedBlock = armed ? blocks.find((b) => b.id === armed.id) : undefined;
  // A selection that moved on takes its waiting Move… and its quiet note with it.
  const [seenSelection, setSeenSelection] = useState(p.selectedBlockId ?? null);
  if ((p.selectedBlockId ?? null) !== seenSelection) {
    setSeenSelection(p.selectedBlockId ?? null);
    setNote(null);
    if (armed && armed.id !== p.selectedBlockId) setArmed(null);
  }
  if (armed && !armedBlock) setArmed(null);
  const selectedId = selected?.id ?? null;
  useEffect(() => {
    if (!selectedId || menuFor.current !== selectedId) return;
    menuFor.current = null;
    menuRef.current?.open();
  }, [selectedId]);

  // The latest props, so the drop target and the keys register once.
  const propsRef = useRef(p);
  useEffect(() => {
    propsRef.current = p;
  });
  const minuteAt = (clientY: number, grabPx = 0) => minuteAtOffset(clientY - (rootRef.current?.getBoundingClientRect().top ?? 0) - grabPx, scale, start);

  const accepts = Boolean(p.onDropTask || p.onMoveBlock);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !accepts) return;
    const at = (clientY: number, grabPx = 0) => minuteAtOffset(clientY - root.getBoundingClientRect().top - grabPx, scale, start);
    const ghostFor = (data: Record<string, unknown>, clientY: number, copy: boolean): Ghost | null => {
      const d = asDragData(data);
      if (!d) return null;
      if (d.type === "task") {
        const len = blockLength(d.estimateMin, propsRef.current.defaultEstimateMin ?? 30);
        return { ...placeAt(at(clientY), len), label: d.title };
      }
      return { ...placeAt(at(clientY, d.grabPx), d.duration), label: copy ? "Copy" : "" };
    };
    // Alt held while dropping a block copies it (SCREENS.md §2.6), when the screen can copy.
    const copying = (data: Record<string, unknown>, altKey: boolean) => altKey && data.type === "block" && Boolean(propsRef.current.onDuplicateBlock);
    return dropTargetForElements({
      element: root,
      canDrop: ({ source }) => asDragData(source.data) !== null,
      onDrag: ({ source, location }) => {
        const input = location.current.input;
        const next = ghostFor(source.data, input.clientY, copying(source.data, input.altKey));
        setGhost((prev) => (prev && next && prev.start === next.start && prev.end === next.end && prev.label === next.label ? prev : next));
      },
      onDragLeave: () => setGhost(null),
      onDrop: ({ source, location }) => {
        setGhost(null);
        const input = location.current.input;
        const d = asDragData(source.data);
        const copy = copying(source.data, input.altKey);
        const g = ghostFor(source.data, input.clientY, copy);
        if (!d || !g) return;
        if (d.type === "task") propsRef.current.onDropTask?.(d.id, g.start);
        else if (copy) propsRef.current.onDuplicateBlock?.(d.id, g.start);
        else propsRef.current.onMoveBlock?.(d.id, g.start);
      },
    });
  }, [accepts, scale]);

  const say = (text: string) => setSaid(text);
  const arm = (kind: Armed["kind"]) => {
    if (!selected) return;
    if (kind === "move" && selected.locked) {
      // A locked block stays where it is (PRODUCT_SPEC.md §10.2): a quiet reason, nothing else.
      setNote("Locked — unlock it to move it");
      return;
    }
    if (kind === "copy" ? !p.onDuplicateBlock : !p.onMoveBlock) return;
    setOffer(null);
    setArmed({ kind, id: selected.id });
  };
  const sendTimes = (kind: Armed["kind"], from: number, to: number) => {
    if (!selected) return;
    setArmed(null);
    const len = selected.end - selected.start;
    const resize = kind === "move" && to - from !== len;
    // What is read out is where it lands: a move or a copy keeps its length, snapped to five minutes.
    const at = resize ? { start: from, end: Math.min(DAY_MIN, to) } : placeAt(from, len);
    if (kind === "copy") p.onDuplicateBlock?.(selected.id, from);
    else if (resize) p.onResizeBlock?.(selected.id, at.start, at.end);
    else p.onMoveBlock?.(selected.id, from);
    say(`${kind === "copy" ? "Copied to" : resize ? "Now" : "Moved to"} ${hhmm(at.start)}–${hhmm(at.end)}`);
  };

  // Opening on the working day, and keeping the now line (or else the minute at the top) in view when the zoom
  // changes. The first time the timeline has a size (a phone's Day view may be hidden at first), its scroller
  // is turned to the morning.
  const scrolledFor = useRef<number | null>(null);
  const openAt = nowShown && nowMin > opening.start + 6 * 60 ? nowMin - 90 : opening.start;
  // A grid column leaves this to the grid, which scrolls every day at once.
  const column = Boolean(p.column);
  useEffect(() => {
    const box = boxRef.current;
    const root = rootRef.current;
    if (!box || !root || column) return;
    const turn = () => {
      if (scrolledFor.current === scale || root.offsetHeight === 0) return;
      const scroller = scrollerOf(box);
      if (!scroller) return;
      const offset = scroller.getBoundingClientRect().top - root.getBoundingClientRect().top;
      const prev = scrolledFor.current;
      scrolledFor.current = scale;
      const target = prev === null ? openAt : nowShown ? nowMin - scroller.clientHeight / scale / 3 : offset / prev;
      scroller.scrollTop += Math.max(0, target) * scale - offset;
    };
    turn();
    if (typeof ResizeObserver !== "function") return;
    const watch = new ResizeObserver(turn);
    watch.observe(box);
    return () => watch.disconnect();
  }, [scale, openAt, nowShown, nowMin, column]);

  // `+` / `-` and the palette's block commands reach the timeline on screen.
  const runRef = useRef<(r: string) => void>(() => undefined);
  const hasBlockRef = useRef(false);
  useEffect(() => {
    hasBlockRef.current = Boolean(selected);
    runRef.current = (r) => {
      if (r === "zoom-in") setZoom(stepZoom(zoom, 1));
      else if (r === "zoom-out") setZoom(stepZoom(zoom, -1));
      else if (selected && r === "rename-block" && p.onRenameBlock) setRenaming(selected.id);
      else if (selected && r === "move-block") arm("move");
      else if (selected && r === "duplicate-block") arm("copy");
    };
  });
  // The timeline holding the selected block takes the commands: in the Calendar's grid every day is a timeline.
  const holdsBlock = Boolean(selected);
  useEffect(() => registerTimeline({ run: (r) => runRef.current(r), hasBlock: () => hasBlockRef.current }), [holdsBlock]);

  // With a block selected: L locks, Backspace/Delete removes, Enter opens its task (or renames a block of your
  // own), Shift+↑/↓ shortens or lengthens it by five minutes, Escape lets go — before the task shortcuts see the key.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // A timeline out of sight (the phone's list view, the wide pane while the detail is open) takes no keys:
      // Backspace there would remove a block nobody can see.
      const root = rootRef.current;
      if (root && typeof root.checkVisibility === "function" && !root.checkVisibility()) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']")) return;
      const q = propsRef.current;
      // Enter on the selected block's own button opens it rather than selecting it again.
      const onSelf = el?.closest?.("[data-block]")?.getAttribute("data-block") === selected.id;
      if (e.key === "Escape") {
        if (armed) setArmed(null);
        else q.onSelectBlock?.(null);
      } else if (e.key === "l" || e.key === "L") {
        if (!q.onToggleLock) return;
        q.onToggleLock(selected.id, !selected.locked);
        say(selected.locked ? "Unlocked" : "Locked");
      } else if (e.key === "Backspace" || e.key === "Delete") {
        if (!q.onRemoveBlock) return;
        q.onRemoveBlock(selected.id);
      } else if (e.key === "Enter" && (onSelf || !el?.closest?.("button, a"))) {
        if (selected.taskId && q.onOpenTask) q.onOpenTask(selected.taskId);
        else if (q.onRenameBlock) setRenaming(selected.id);
        else return;
      } else if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        if (!q.onResizeBlock || selected.locked) return;
        const next = resizeEnd(selected, selected.end + (e.key === "ArrowDown" ? 5 : -5));
        if (next.end !== selected.end) {
          q.onResizeBlock(selected.id, next.start, next.end);
          say(`${selected.title}, ${hhmm(next.start)} to ${hhmm(next.end)}`);
        }
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [selected, armed]);

  const beginResize = (block: TimelineBlock) => (edge: "start" | "end", e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!rootRef.current || block.locked) return;
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    const edgeAt = (clientY: number) => (edge === "end" ? resizeEnd(block, minuteAt(clientY)) : resizeStart(block, minuteAt(clientY)));
    const move = (ev: globalThis.PointerEvent) => setResizing({ id: block.id, ...edgeAt(ev.clientY) });
    const up = (ev: globalThis.PointerEvent) => {
      target.releasePointerCapture?.(ev.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setResizing(null);
      const next = edgeAt(ev.clientY);
      if (next.start !== block.start || next.end !== block.end) propsRef.current.onResizeBlock?.(block.id, next.start, next.end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  // Drawing a block of your own (PRODUCT_SPEC.md §10.2): a mouse or pen drag on empty space, past a few pixels,
  // draws a ghost snapped to fifteen minutes; letting go makes the block and opens it for a name. A touch drag
  // scrolls instead, and a tap offers "New block here".
  const waiting = Boolean(p.placing || armed);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    lastPointer.current = e.pointerType;
    // A drawing let go outside the timeline never got its click: it must not swallow this one.
    suppressClick.current = false;
    const root = rootRef.current;
    if (!root || !p.onCreateBlock || waiting || e.button !== 0 || e.pointerType === "touch") return;
    if ((e.target as HTMLElement).closest("[data-block], [data-testid='block-toolbar'], button, input")) return;
    const fromY = e.clientY;
    const fromMin = (fromY - root.getBoundingClientRect().top) / scale + start;
    let drawn: Interval | null = null;
    const move = (ev: globalThis.PointerEvent) => {
      if (!drawn && Math.abs(ev.clientY - fromY) < DRAW_PX) return;
      drawn = drawnBlock(fromMin, (ev.clientY - root.getBoundingClientRect().top) / scale + start);
      setDrawing(drawn);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrawing(null);
      if (!drawn) return;
      suppressClick.current = true;
      void propsRef.current.onCreateBlock?.(drawn.start, drawn.end).then((id) => id && setRenaming(id));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onTap = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (armed) {
      const min = minuteAt(e.clientY);
      sendTimes(armed.kind, min, min + ((armedBlock?.end ?? 0) - (armedBlock?.start ?? 0)));
      return;
    }
    if (p.placing && p.onTapSlot) {
      p.onTapSlot(minuteAt(e.clientY));
      return;
    }
    // On touch, a tap on an empty slot with nothing selected offers a block of your own there; any other tap lets go.
    if (lastPointer.current === "touch" && p.onCreateBlock && !p.selectedBlockId && offer === null) {
      setOffer(Math.min(DAY_MIN - TAP_BLOCK_MIN, Math.floor(minuteAt(e.clientY) / 15) * 15));
      return;
    }
    setOffer(null);
    p.onSelectBlock?.(null);
  };
  const createAt = (from: number) => {
    setOffer(null);
    void p.onCreateBlock?.(from, from + TAP_BLOCK_MIN).then((id) => id && setRenaming(id));
  };

  // The ruler: an hour line and label per hour, a fainter line per row (half hours at the default zoom, with
  // 4 px ticks at the quarters), and at the 5-minute zoom a quiet label at each quarter.
  // A label within reach of the now time or the done-by pill gives way to it.
  const hours = Array.from({ length: (end - start) / 60 }, (_, i) => start + i * 60);
  const reach = 12 / (scale / PX_PER_MIN);
  const labelHidden = (m: number) => (nowShown && Math.abs(m - nowMin) <= reach) || (finishMin !== null && Math.abs(m - finishMin) <= reach + 2);
  const rows = Array.from({ length: 60 / zoom - 1 }, (_, i) => (i + 1) * zoom);
  // Free gaps of half an hour or more are content: named in spare, and the tap-to-schedule targets. The part already gone is not free.
  const gaps = c.free.map((g) => ({ start: Math.max(g.start, elapsed), end: g.end })).filter((g) => g.end - g.start >= FREE_LABEL_MIN);
  // The dashed outline under a pointer: a dragged row or block, or a block being drawn.
  const shade: Ghost | null = ghost ?? (drawing && { ...drawing, label: "New block" });
  const bar = armed && armedBlock ? (armed.kind === "move" ? `Tap a new time for “${armedBlock.title}”` : `Tap a time for a copy of “${armedBlock.title}”`) : null;

  return (
    <div className="flex flex-col">
      {/* In a grid column the bar would push one day's hours out of line: the toolbar's fields and the label say it there. */}
      {bar && !column && <PlacingBar text={bar} onCancel={() => setArmed(null)} />}
      {/* The zoom (SCREENS.md §2.6): + and - from the keyboard, this on every screen, the phone's tap path. */}
      {!column && <ZoomControl zoom={zoom} />}
      <div ref={boxRef} className={cx(!column && "max-h-[70dvh] overflow-y-auto overscroll-contain", p.paneScrolls && "lg:max-h-none lg:overflow-visible")}>
        <div
          ref={rootRef}
          className={cx("relative select-none", waiting && "cursor-crosshair")}
          style={{ height: (end - start) * scale, "--tl-g": column ? "0px" : "3rem" } as CSSProperties}
          data-testid="timeline"
          data-zoom={zoom}
          data-placing={waiting ? "true" : undefined}
          aria-label={p.placing ? `Tap a time for ${p.placing.title}` : (bar ?? undefined)}
          onPointerDown={onPointerDown}
          onClick={onTap}
        >
          {/* Under the grid: the page's own paper shows through where the working day is not, a step down from the surface in either theme. */}
          {outside.map((o) => (
            <div key={`o${o.start}`} aria-hidden="true" data-testid="outside-hours" className="pointer-events-none absolute right-0 bg-paper/80" style={{ ...AT_GUTTER, top: y(o.start), height: (o.end - o.start) * scale }} />
          ))}
          {hours.map((h) => (
            <div key={h} className="pointer-events-none absolute inset-x-0" style={{ top: y(h) }}>
              <div className="absolute top-0 right-0 border-t border-line" style={AT_GUTTER} />
              {!column && !labelHidden(h) && <span className="absolute -top-[7px] left-0 w-10 text-micro font-medium text-ink-3 num">{formatTime(timeFromMinutes(h))}</span>}
              {rows.map((r) => (
                <div key={r} className={cx("absolute right-0 border-t border-line", r % 30 === 0 ? "opacity-55" : "opacity-30")} style={{ ...AT_GUTTER, top: r * scale }}>
                  {!column && zoom === 5 && r % 15 === 0 && !labelHidden(h + r) && <span className="absolute -top-[7px] -left-12 w-10 text-micro text-ink-3 num">{formatTime(timeFromMinutes(h + r))}</span>}
                </div>
              ))}
              {!column && zoom === 30 && [15, 30, 45].map((q) => <span key={q} className="absolute left-11 h-px w-1 bg-line-strong" style={{ top: q * scale }} />)}
            </div>
          ))}
          {gaps.map((g, i) => (
            <div
              key={`f${i}`}
              className="pointer-events-none absolute right-2 flex items-center justify-center rounded-sm bg-spare-soft/45 text-label font-semibold text-spare num"
              style={{ ...INSIDE, top: y(g.start) + 1, height: (g.end - g.start) * scale - 2 }}
            >
              {formatMinutes(g.end - g.start)} free{finishMin !== null && g.start >= finishMin && " · after the plan"}
            </div>
          ))}
          {c.busy.map((b, i) => {
            const height = Math.max(14, (b.end - b.start) * scale - 2);
            const past = b.end <= elapsed;
            const tall = height >= TWO_LINE_PX;
            // An invitation not yet answered is still busy, hatched like on the ribbon (SYSTEM_DESIGN.md §5.4).
            const unanswered = (c.unanswered ?? []).some((u) => u.start <= b.start && u.end >= b.end);
            return (
              <div
                key={`m${i}`}
                data-meeting={b.start}
                data-unanswered={unanswered ? "true" : undefined}
                className={cx(
                  "absolute right-2 overflow-hidden rounded-sm border-l-[3px] px-2 pl-2.5",
                  tall ? "py-1" : "flex items-center gap-1.5",
                  past ? "border-meet-line bg-[color-mix(in_oklab,var(--meet-soft)_55%,var(--surface))]" : "border-meet-fill bg-meet-soft",
                  unanswered && "meet-hatch",
                  p.shownMeeting === b.start && "outline-2 outline-offset-1 outline-meet-fill",
                )}
                style={{ ...INSIDE, top: y(b.start) + 1, height, ...laneStyle(lanes.get(`m${i}`)) }}
              >
                <span className="block min-w-0 truncate text-label leading-[15px] font-semibold text-meet">
                  {meetingTitle(b, p.meetings)}
                  {unanswered && <span className="sr-only">, not answered yet</span>}
                </span>
                {/* On one line the time keeps its shape and the title gives way. */}
                <span className={cx("block text-micro text-meet num", tall ? "truncate" : "shrink-0 whitespace-nowrap")}>{tall ? rangeLine(b.start, b.end) : hhmm(b.start)}</span>
              </div>
            );
          })}
          {blocks.map((b) => {
            const shown = resizing?.id === b.id ? { ...b, start: resizing.start, end: resizing.end } : b;
            return (
              <Block
                key={b.id}
                block={shown}
                lane={lanes.get(b.id)}
                style={{ top: y(shown.start), height: (shown.end - shown.start) * scale }}
                past={b.end <= elapsed}
                selected={p.selectedBlockId === b.id}
                movable={Boolean(p.onMoveBlock) && !b.locked}
                renaming={renaming === b.id}
                onSelect={() => {
                  setOffer(null);
                  p.onSelectBlock?.(b.id);
                }}
                onRename={p.onRenameBlock ? () => setRenaming(b.id) : undefined}
                onRenamed={(title) => {
                  setRenaming(null);
                  if (title !== null && title.trim() !== b.title) p.onRenameBlock?.(b.id, title);
                }}
                onResizeStart={p.onResizeBlock && !b.locked ? beginResize(b) : undefined}
                onMenu={
                  p.onSelectBlock &&
                  (() => {
                    setOffer(null);
                    setArmed(null);
                    if (p.selectedBlockId === b.id) menuRef.current?.open();
                    else {
                      menuFor.current = b.id;
                      p.onSelectBlock?.(b.id);
                    }
                  })
                }
              />
            );
          })}
          {selected && renaming !== selected.id && (
            <BlockToolbar
              block={selected}
              top={selected.start * scale < 56 ? y(selected.end) + 4 : y(selected.start)}
              below={selected.start * scale < 56}
              armed={armed?.id === selected.id ? armed.kind : null}
              note={note}
              menu={menuRef}
              actions={{
                onOpen: selected.taskId && p.onOpenTask ? () => p.onOpenTask?.(selected.taskId as string) : undefined,
                onArm: p.onMoveBlock ? arm : undefined,
                onToggleLock: p.onToggleLock ? () => p.onToggleLock?.(selected.id, !selected.locked) : undefined,
                onRemove: p.onRemoveBlock ? () => p.onRemoveBlock?.(selected.id) : undefined,
                onRename: p.onRenameBlock ? () => setRenaming(selected.id) : undefined,
                onTimes: sendTimes,
                onCancel: () => setArmed(null),
              }}
            />
          )}
          {/* Proposed blocks: a dashed block-fill outline over a thin block wash, so they read as blocks that are not there yet.
              The preview panel lists each one with its time and reason, so the drawing is hidden from assistive tech. */}
          {(p.proposed ?? []).map((g) => {
            const height = Math.max(24, (g.end - g.start) * scale - 2);
            const tall = height >= TWO_LINE_PX;
            return (
              <div
                key={`plan-${g.key}`}
                aria-hidden="true"
                data-testid="plan-ghost"
                data-plan-ghost={g.key}
                className={cx(
                  "pointer-events-none absolute right-2 scroll-mt-14 overflow-hidden rounded-sm border-[1.5px] border-dashed border-block-fill bg-block-soft/60 px-2",
                  tall ? "flex flex-col justify-start py-1" : "flex items-center gap-1.5",
                )}
                style={{ ...INSIDE, top: y(g.start) + 1, height }}
              >
                <span className="block min-w-0 truncate text-label leading-[15px] font-semibold text-ink">{g.title}</span>
                <span className={cx("block text-micro text-ink-2 num", tall ? "truncate" : "shrink-0 whitespace-nowrap")}>{tall ? rangeLine(g.start, g.end) : hhmm(g.start)}</span>
              </div>
            );
          })}
          {shade && (
            <div
              data-testid="timeline-ghost"
              className="pointer-events-none absolute right-2 flex items-center gap-1.5 overflow-hidden rounded-sm border border-dashed border-line-strong bg-surface/80 px-2 text-label text-ink-2"
              style={{ ...INSIDE, top: y(shade.start) + 1, height: Math.max(12, (shade.end - shade.start) * scale - 2) }}
            >
              <span className="num">{ghost ? hhmm(shade.start) : `${hhmm(shade.start)}–${hhmm(shade.end)}`}</span>
              <span className="truncate">{shade.label}</span>
            </div>
          )}
          {offer !== null && (
            // Touch: a block of your own where the tap was, half an hour, ready to rename and resize.
            <div className="absolute right-2 z-10 flex items-start" style={{ ...INSIDE, top: y(offer) }} onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => createAt(offer)} className="flex h-11 items-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-surface px-3 text-body-sm font-medium text-ink shadow-raised">
                New block here <span className="text-ink-3 num">{hhmm(offer)}</span>
              </button>
            </div>
          )}
          {/* The working day's end, a shade firmer than an hour line. */}
          <div className="pointer-events-none absolute right-0 border-t border-line-strong" style={{ ...AT_GUTTER, top: y(workEnd) }} />
          {finishMin !== null && (
            <>
              <div className="pointer-events-none absolute right-0 z-2 border-t-[1.5px] border-dashed border-spare-fill" style={{ ...AT_GUTTER, top: y(finishMin) }} />
              <Chip tone="spare" size="sm" className="pointer-events-none absolute left-0 z-4 px-2" style={{ top: y(finishMin) - 10 }}>
                done by {formatTime(c.projectedFinish!)}
              </Chip>
            </>
          )}
          {c.overflowMin > 0 && (
            // The plan runs past the day (SCREENS.md §2.6 "Projected finish"): pinned to the edge, saying by how much.
            <Chip tone="over" size="sm" data-testid="overrun" className="pointer-events-none absolute z-4 px-2" style={{ ...INSIDE, top: y(workEnd) + 4 }}>
              {formatMinutes(c.overflowMin)} past the end of your day
            </Chip>
          )}
          {nowShown && (
            <>
              {!column && (
                <span className="pointer-events-none absolute left-0 z-3 w-10 text-micro font-semibold text-ink num" style={{ top: y(nowMin) - 7 }}>
                  {formatTime(timeFromMinutes(nowMin))}
                </span>
              )}
              <div className={cx("pointer-events-none absolute right-0 z-3 border-t-2 border-ink", column ? "left-0" : "left-10")} style={{ top: y(nowMin) - 1 }}>
                <span className="absolute -top-[5.5px] left-0 size-[9px] rounded-full bg-ink" />
              </div>
            </>
          )}
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}

/** The − / + control: the zoom's tap path (SCREENS.md §2.6); the Calendar's grid draws one for all its days. */
export function ZoomControl({ zoom }: { zoom: ZoomStep }) {
  return (
    <div className="-mt-1 mb-1 flex items-center justify-end gap-0.5 print:hidden" role="group" aria-label="Timeline zoom">
      <span className="mr-1 text-micro text-ink-3 num">{zoom}m rows</span>
      {([-1, 1] as const).map((dir) => (
        <button
          key={dir}
          type="button"
          aria-label={dir === 1 ? "Zoom in" : "Zoom out"}
          title={dir === 1 ? "Zoom in (+)" : "Zoom out (-)"}
          disabled={stepZoom(zoom, dir) === zoom}
          onClick={() => setZoom(stepZoom(zoom, dir))}
          className="flex size-11 items-center justify-center rounded-lg text-body font-medium text-ink-2 transition-colors dur-fast hover:bg-hover hover:text-ink disabled:text-ink-3 disabled:hover:bg-transparent sm:size-7 touch:size-11"
        >
          {dir === 1 ? "+" : "−"}
        </button>
      ))}
    </div>
  );
}
