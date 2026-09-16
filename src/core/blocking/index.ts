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

/** Blocks that overlap each other, for drawing side by side (a block over a meeting is allowed). */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}
