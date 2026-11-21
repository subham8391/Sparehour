// The ribbon's breakdown in words (SCREENS.md §2.2 "Interactions"), alone: the day as the ribbon draws it, in clock
// order and by name, the segment under a minute of it, the line that names a segment, what a tap on it offers, and
// the equation behind the spare figure. None of the overlay's pointer handling or drawing (ribbon-overlay.tsx), so
// the Android app says the same breakdown as the web does (docs/mobile/ANDROID_APP_SPEC.md §4). ribbon-overlay.tsx
// hands every name on, so imports of them from the overlay stay as they were.
import { round5 } from "@/core/capacity/intervals";
import { USABLE_GAP_MIN, type Capacity, type Interval } from "@/core/capacity";
import { formatMinutes, formatTime, timeFromMinutes } from "@/core/time";
import type { TimelineBlock, TimelineMeeting } from "./hooks/use-today";

export type SegmentKind = "meeting" | "block" | "free" | "off" | "over";

export interface RibbonSegment {
  kind: SegmentKind;
  start: number;
  end: number;
  /** What it is, in words: a meeting's title, a block's, "2 meetings". */
  name: string;
}

const KIND_WORD: Record<SegmentKind, string> = { meeting: "Meeting", block: "Block", free: "Free", off: "Outside working hours", over: "Over" };

/** The breakdown's name, for the button over the drawing and for its panel. */
export const BREAKDOWN_LABEL = "Spare time breakdown";

const inside = <T extends Interval>(list: readonly T[], iv: Interval) => list.filter((x) => x.start < iv.end && x.end > iv.start);
function named(list: readonly { title: string }[], one: string, many: string): string {
  if (list.length === 1) return list[0].title;
  return list.length > 1 ? `${list.length} ${many}` : one;
}

/** What an open stretch is called: one too short to count as spare time says so, rather than reading as free time (DECISIONS.md, amendment 2026-11-15). */
const freeName = (f: Interval) => (f.end - f.start < USABLE_GAP_MIN ? "Too short to use" : "Free");

/** The day as the ribbon draws it, in clock order: meetings, blocks, free time, and the hours between work windows. */
export function ribbonSegments(c: Capacity, meetings: readonly TimelineMeeting[], blocks: readonly TimelineBlock[]): RibbonSegment[] {
  const day = c.windows[0]?.start ?? 0;
  const end = c.windows[c.windows.length - 1]?.end ?? 0;
  const segs: RibbonSegment[] = [
    ...c.busy.map((b) => ({ kind: "meeting" as const, ...b, name: named(inside(meetings, b), "Busy", "meetings") })),
    ...c.blocks.map((b) => ({ kind: "block" as const, ...b, name: named(inside(blocks, b), "Block", "blocks") })),
    ...c.free.map((f) => ({ kind: "free" as const, ...f, name: freeName(f) })),
  ];
  for (let i = 1; i < c.windows.length; i++) segs.push({ kind: "off", start: c.windows[i - 1].end, end: c.windows[i].start, name: KIND_WORD.off });
  return segs.filter((s) => s.end > s.start && s.start >= day && s.end <= end).sort((a, b) => a.start - b.start);
}

/** The segment under a minute of the day; past the end of the day while it spills, the overhang. */
export function segmentAt(segs: readonly RibbonSegment[], c: Capacity, minute: number): RibbonSegment | null {
  const end = c.windows[c.windows.length - 1]?.end ?? 0;
  if (minute >= end && c.overflowMin > 0) return { kind: "over", start: end, end: end + c.overflowMin, name: `${formatMinutes(c.overflowMin)} more than fits` };
  // The last pixel of the day belongs to the day's last segment.
  const m = Math.min(minute, end - 1);
  return segs.find((s) => m >= s.start && m < s.end) ?? null;
}

const range = (s: Interval) => `${formatTime(timeFromMinutes(s.start))}–${formatTime(timeFromMinutes(s.end))}`;

/** The tooltip line: "Meeting · Design review · 10:00–11:00 · 1h". The kind is a word, never only a colour (DESIGN_SYSTEM.md §9). */
export function segmentLine(s: RibbonSegment): string {
  if (s.kind === "over") return `${KIND_WORD.over} · ${s.name}`;
  const head = s.kind === "meeting" || s.kind === "block" ? `${KIND_WORD[s.kind]} · ${s.name}` : s.name;
  return `${head} · ${range(s)} · ${formatMinutes(s.end - s.start)}`;
}

/** What a segment's panel offers once it is pinned: free time takes something new, a meeting is shown on the timeline. */
export function segmentAction(s: Pick<RibbonSegment, "kind"> | null): "Add something" | "Show on timeline" | null {
  return s?.kind === "free" ? "Add something" : s?.kind === "meeting" ? "Show on timeline" : null;
}

/**
 * The breakdown in words (PRODUCT_SPEC.md §9.1, the same sentence as the reveal and Settings): "9h working − 2h in
 * meetings − 1h 20m buffer (15% of your working day) − 2h 20m planned = 3h 20m spare". Without a calendar the
 * meetings term is left out; open stretches too short to use are a term of their own when the day has any, so the
 * sentence still adds up; a buffer capped by what meetings and those gaps left drops the share it no longer is.
 */
export function breakdownTerms(c: Capacity, bufferPct: number, connected: boolean): { terms: string[]; result: string } {
  const capped = c.bufferMin < round5((c.workMin * bufferPct) / 100);
  const terms = [`${formatMinutes(c.workMin)} working`];
  if (connected) terms.push(`${formatMinutes(c.busyMin)} in meetings`);
  if (c.gapMin > 0) terms.push(`${formatMinutes(c.gapMin)} in gaps too short to use`);
  terms.push(capped ? `${formatMinutes(c.bufferMin)} buffer` : `${formatMinutes(c.bufferMin)} buffer (${bufferPct}% of your working day)`);
  terms.push(`${formatMinutes(c.committedMin + c.unscheduledMin)} planned`);
  return { terms, result: c.spareMin >= 0 ? `${formatMinutes(c.spareMin)} spare` : `${formatMinutes(-c.spareMin)} over` };
}

export function breakdownSentence(c: Capacity, bufferPct: number, connected: boolean): string {
  const { terms, result } = breakdownTerms(c, bufferPct, connected);
  return `${terms.join(" − ")} = ${result}`;
}
