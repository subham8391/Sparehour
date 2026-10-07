// Time-blocking arithmetic (PRODUCT_SPEC.md §10.2, SCREENS.md §2.6): where a
// block goes, how long it is, and where a pointer on the timeline lands.
// Minutes of the day throughout; pure.
import type { Interval } from "../capacity";

export const SNAP_MIN = 5;
export const AD_HOC_SNAP_MIN = 15;
export const MIN_BLOCK_MIN = 5;

export function snapTo(minute: number, step = SNAP_MIN): number {
  return Math.round(minute / step) * step;
}

export function clampMinute(minute: number): number {
  return Math.min(24 * 60, Math.max(0, minute));
}

/** A block is the task's estimate (or the default), snapped, never shorter than five minutes. */
export function blockLength(estimateMin: number | null, defaultEstimateMin: number): number {
  return Math.max(MIN_BLOCK_MIN, snapTo(estimateMin ?? defaultEstimateMin));
}

/**
 * The first gap in `free` at or after `fromMin` that holds `durationMin`,
 * as the block it would become; null when the day has no such gap.
 */
export function nextFreeGap(free: readonly Interval[], fromMin: number, durationMin: number): Interval | null {
  const from = snapTo(fromMin);
  for (const gap of [...free].sort((a, b) => a.start - b.start)) {
    const start = Math.max(gap.start, from);
    if (gap.end - start >= durationMin) return { start, end: start + durationMin };
  }
  return null;
}

/**
 * Where `B` puts a block (SCREENS.md §24): the next free gap that fits;
 * failing that, the largest remaining gap shrunk to fit; failing that,
 * straight after the working day, where the ribbon already shows it spilling
 * over. Never null — pressing B always does something visible.
 */
export function chooseSlot(free: readonly Interval[], fromMin: number, durationMin: number, dayEndMin: number): Interval {
  const fits = nextFreeGap(free, fromMin, durationMin);
  if (fits) return fits;
  const from = snapTo(fromMin);
  const remaining = free.map((g) => ({ start: Math.max(g.start, from), end: g.end })).filter((g) => g.end - g.start >= MIN_BLOCK_MIN);
  if (remaining.length > 0) {
    const widest = remaining.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
    return { start: widest.start, end: widest.end };
  }
  return placeAt(Math.max(snapTo(dayEndMin), from), durationMin);
}

/** Where a pointer at `offsetPx` from the top of the timeline lands, snapped. */
export function minuteAtOffset(offsetPx: number, pxPerMinute: number, dayStartMin: number, step = SNAP_MIN): number {
  return clampMinute(snapTo(dayStartMin + offsetPx / pxPerMinute, step));
}

/** A block dropped at `startMin` keeps its length and stays inside the day. */
export function placeAt(startMin: number, durationMin: number): Interval {
  const start = clampMinute(snapTo(startMin));
  const end = Math.min(24 * 60, start + Math.max(durationMin, MIN_BLOCK_MIN));
  return { start: Math.max(0, Math.min(start, end - MIN_BLOCK_MIN)), end };
}

/** Resizing from the bottom edge: the end moves, never past the day, never under five minutes. */
export function resizeEnd(block: Interval, newEndMin: number): Interval {
  const end = Math.min(24 * 60, Math.max(block.start + MIN_BLOCK_MIN, snapTo(newEndMin)));
  return { start: block.start, end };
}

/** Resizing from the top edge: the start moves, never before midnight, never closer than five minutes to the end. */
export function resizeStart(block: Interval, newStartMin: number): Interval {
  const start = Math.max(0, Math.min(block.end - MIN_BLOCK_MIN, snapTo(newStartMin)));
  return { start, end: block.end };
}

/**
 * An ad-hoc block drawn by dragging on empty timeline space (PRODUCT_SPEC.md §10.2): from where the pointer went
 * down to where it is, either direction, snapped out to fifteen minutes and never shorter than fifteen.
 */
export function drawnBlock(fromMin: number, toMin: number): Interval {
  const a = clampMinute(Math.min(fromMin, toMin));
  const b = clampMinute(Math.max(fromMin, toMin));
  const end = Math.min(24 * 60, Math.max(Math.floor(a / AD_HOC_SNAP_MIN) * AD_HOC_SNAP_MIN + AD_HOC_SNAP_MIN, Math.ceil(b / AD_HOC_SNAP_MIN) * AD_HOC_SNAP_MIN));
  const start = Math.min(Math.floor(a / AD_HOC_SNAP_MIN) * AD_HOC_SNAP_MIN, end - AD_HOC_SNAP_MIN);
  return { start, end };
}

/**
 * The timeline's zoom (SCREENS.md §2.6, DECISIONS.md "Timeline zoom"): rows of 30, 15 or 5 minutes, each row the
 * same 33 px, so the default is the design's 66 px per hour.
 */
export const ZOOM_STEPS = [30, 15, 5] as const;
export type ZoomStep = (typeof ZOOM_STEPS)[number];
const ROW_PX = 33;

/** Pixels per minute at a zoom step. */
export function pxPerMinute(step: ZoomStep): number {
  return ROW_PX / step;
}

/** The next zoom step in (`+`, finer rows) or out (`-`); the ends stay where they are. */
export function stepZoom(step: ZoomStep, dir: 1 | -1): ZoomStep {
  const i = Math.max(0, ZOOM_STEPS.indexOf(step));
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + dir))];
}

/** The minutes several blocks cover, overlaps counted once (PRODUCT_SPEC.md §10.2 "Multiple blocks per task"). */
export function coveredMinutes(blocks: readonly Interval[]): number {
  let total = 0;
  let reach = -1;
  for (const b of [...blocks].sort((x, y) => x.start - y.start)) {
    const from = Math.max(b.start, reach);
    if (b.end > from) total += b.end - from;
    reach = Math.max(reach, b.end);
  }
  return total;
}

/**
 * The quiet hint when a task's blocks do not add up to its estimate (PRODUCT_SPEC.md §10.2, "a mismatch shows a
 * hint, never an error"): how far short or over, or null when they match or there is no estimate to compare with.
 */
export function estimateMismatch(blockedMin: number, estimateMin: number | null): { kind: "short" | "over"; min: number } | null {
  if (estimateMin == null || blockedMin <= 0 || blockedMin === estimateMin) return null;
  return blockedMin < estimateMin ? { kind: "short", min: estimateMin - blockedMin } : { kind: "over", min: blockedMin - estimateMin };
}

/** Blocks that overlap each other, for drawing side by side (a block over a meeting is allowed). */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}
