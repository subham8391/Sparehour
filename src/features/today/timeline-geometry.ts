// The day timeline's arithmetic and words, alone (SCREENS.md §2.6, §2.8): where it opens, what a busy stretch is
// called, which free gaps are named, where a tap offers a block, where a task waiting for a time is shown, and where
// a block lands when its Move… or Duplicate is answered with a tap or with times. None of the timeline's drawing
// (timeline.tsx, block-tools.tsx), so the Android app's timeline decides every one of these as the web's does
// (docs/mobile/ANDROID_APP_SPEC.md §4). The two web files use these and hand the names they exported on.
import { placeAt } from "@/core/blocking";
import type { Interval } from "@/core/capacity";
import { formatMinutes, formatTime, timeFromMinutes } from "@/core/time";
import { minutesOfField } from "@/features/blocking/minutes";

/** The padding drawn either side of the working day (SCREENS.md §2.6). */
const PAD_MIN = 60;
export const DAY_MIN = 24 * 60;
/** A free gap shorter than this is not worth naming. */
export const FREE_LABEL_MIN = 30;
/** "New block here" on touch starts no later than half an hour before midnight (PRODUCT_SPEC.md §10.2). */
export const TAP_BLOCK_MIN = 30;

export const hhmm = (m: number) => formatTime(timeFromMinutes(m));
/** "10:00–11:30 · 1h 30m" */
export const rangeLine = (start: number, end: number) => `${hhmm(start)}–${hhmm(end)} · ${formatMinutes(end - start)}`;

/** The one event that fills a busy interval names it; two overlapping ones, or a private calendar, read "Busy". */
export function meetingTitle(b: Interval, meetings: readonly (Interval & { title: string })[] | undefined): string {
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

/** The minute the timeline is first turned to: the opening stretch, or an hour and a half before now once the day is well under way. */
export function openingMinute(opening: Interval, nowMin: number | null): number {
  return nowMin !== null && nowMin > opening.start + 6 * 60 ? nowMin - 90 : opening.start;
}

/** Free gaps of half an hour or more are content: named in spare, and the tap-to-schedule targets. The part already gone is not free. */
export function namedGaps(free: readonly Interval[], elapsed: number): Interval[] {
  return free.map((g) => ({ start: Math.max(g.start, elapsed), end: g.end })).filter((g) => g.end - g.start >= FREE_LABEL_MIN);
}

/** The first free stretch still ahead, where a task that starts waiting for a time is shown (SCREENS.md §2.8); null when the day has none left. */
export function firstFreeAhead(free: readonly Interval[], elapsed: number): Interval | null {
  return free.find((g) => g.end - Math.max(g.start, elapsed) >= FREE_LABEL_MIN) ?? free.find((g) => g.end > elapsed) ?? null;
}

/** Where a tap on an empty time offers "New block here": the quarter hour it fell in, never too late for a block to fit before midnight. */
export function offerAt(minute: number): number {
  return Math.min(DAY_MIN - TAP_BLOCK_MIN, Math.floor(minute / 15) * 15);
}

/**
 * Where a block lands when its Move… or Duplicate is answered: a copy and a move keep the block's length, snapped
 * to five minutes; a move whose end was changed too is a resize to exactly those minutes. `said` is what is read out.
 */
export function landing(kind: "move" | "copy", block: Interval, from: number, to: number): { how: "move" | "copy" | "resize"; start: number; end: number; said: string } {
  const len = block.end - block.start;
  const resize = kind === "move" && to - from !== len;
  // What is read out is where it lands: a move or a copy keeps its length, snapped to five minutes.
  const at = resize ? { start: from, end: Math.min(DAY_MIN, to) } : placeAt(from, len);
  return { how: kind === "copy" ? "copy" : resize ? "resize" : "move", ...at, said: `${kind === "copy" ? "Copied to" : resize ? "Now" : "Moved to"} ${hhmm(at.start)}–${hhmm(at.end)}` };
}

/**
 * The From / To fields as they are sent (the toolbar's time fields, the phone's sheet): a new end resizes, from
 * whatever start is shown; a new start alone moves the block, keeping its length, earlier or later, overlapping
 * where it was or not. Null when the start cannot be read, or the end asked for is not after it.
 */
export function askedTimes(kind: "move" | "copy", block: Interval, from: string, to: string): { from: number; to: number } | null {
  const f = minutesOfField(from);
  const t = minutesOfField(to);
  if (f === null) return null;
  const endChanged = kind === "move" && to !== hhmm(block.end) && t !== null;
  if (endChanged && t <= f) return null;
  return { from: f, to: endChanged ? t : f + (block.end - block.start) };
}
