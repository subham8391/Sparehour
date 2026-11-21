// Where the ribbon puts its parts on a phone (SCREENS.md §2.2; the web's is features/today/ribbon.tsx): the working
// day from its first hour to its last, with meetings, unanswered invitations and blocks at their own hours, what has
// gone, the now mark, the projected finish, the hour ticks and the one label row under them. Every position is the
// web's own geometry (../../../../src/features/today/day-geometry.ts) and every label, with the rule for which hour
// gives way to a cursor's time, is the web's own (ribbon-words.ts); only the percentages a phone draws with are
// worked out here. So is the breakdown a tap on the ribbon opens: the day's segments by name, the segment under a
// minute and the equation behind the figure are the web's own (ribbon-breakdown.ts); only which minute a touch is on
// is worked out here. Its own file, free of the screen, so it is tested plainly.
import type { Capacity } from "@/core/capacity";
import { dayGeometry } from "@/features/today/day-geometry";
import type { TimelineBlock, TimelineMeeting } from "@/features/today/hooks/use-today";
import { breakdownSentence, breakdownTerms, ribbonSegments, segmentAt, type RibbonSegment as NamedSegment } from "@/features/today/ribbon-breakdown";
import { ribbonLabels, type RibbonLabel } from "@/features/today/ribbon-words";

export type { RibbonSegment as NamedSegment } from "@/features/today/ribbon-breakdown";

/** Under this many points of track the web hides every second hour and widens a cursor's berth (ribbon-words.ts). */
export const NARROW_TRACK = 340;

export interface RibbonSegment {
  kind: "meeting" | "unanswered" | "block";
  /** From the day's near edge, and how wide, each as a share of 100. */
  left: number;
  width: number;
}

export interface RibbonMark {
  key: string;
  text: string;
  kind: RibbonLabel["kind"];
  /** Where it sits along the day, as a share of 100. */
  left: number;
  /** The first label sits flush at the near edge and the last at the far one, so nothing pokes out of the card. */
  align: "start" | "center" | "end";
  hide: RibbonLabel["hide"];
}

export interface RibbonShape {
  segments: RibbonSegment[];
  /** How much of the day has gone, as a share of 100; 0 on another day. */
  elapsed: number;
  /** The now mark and the projected finish, each as a share of 100; null when it is not on the day. */
  now: number | null;
  finish: number | null;
  /** The over-tail's share of the card, capped as on the web; 0 when the plan fits. */
  tail: number;
  /** A tick at every whole hour inside the day, as shares of 100. */
  ticks: number[];
  labels: RibbonMark[];
}

/** `nowMin` is left out on another day: no elapsed part and no now mark. */
export function ribbonShape(c: Capacity, nowMin?: number): RibbonShape | null {
  if (c.state === "no_work_day" || c.windows.length === 0) return null;
  const g = dayGeometry(c, nowMin);
  const pct = (m: number) => g.at(m) * 100;
  const part = (kind: RibbonSegment["kind"]) => (b: { start: number; end: number }) => ({ kind, left: pct(b.start), width: pct(b.end) - pct(b.start) });
  const finishMin = c.projectedFinish ? c.projectedFinish.hour * 60 + c.projectedFinish.minute : undefined;
  return {
    segments: [...g.busy.map(part("meeting")), ...g.unanswered.map(part("unanswered")), ...g.blocks.map(part("block"))],
    elapsed: g.elapsed * 100,
    now: g.now !== undefined ? pct(g.now) : null,
    finish: g.finish !== undefined ? pct(g.finish) : null,
    tail: g.tail * 100,
    ticks: g.hours.length > 1 ? g.hours.map(pct) : [],
    labels: ribbonLabels(g.day, g.end, nowMin, finishMin).map((l) => {
      const left = pct(l.min);
      return { key: `${l.kind}${l.min}`, text: l.text, kind: l.kind, left, align: left < 4 ? "start" : left > 96 ? "end" : "center", hide: l.hide };
    }),
  };
}

/** The labels drawn on a track this wide: none that a cursor's time took the place of, and on a narrow one only the ones the web keeps there. */
export function labelsFor(shape: RibbonShape, trackWidth: number): RibbonMark[] {
  return shape.labels.filter((l) => l.hide === "never" || (l.hide === "narrow" && trackWidth >= NARROW_TRACK));
}

/** The over-tail is never drawn thinner than this, in points (ribbon.tsx), so a small overrun can still be touched. */
export const TAIL_MIN = 3;

/**
 * The minute of the day under a touch `x` points along a ribbon `width` points wide. The day is drawn up to the
 * over-tail, which sits past its far edge, so a touch on the tail is a minute past the day's end. Null before the
 * ribbon has a width.
 */
export function minuteAtTouch(c: Capacity, x: number, width: number): number | null {
  if (c.windows.length === 0 || width <= 0) return null;
  const g = dayGeometry(c);
  const tail = g.tail > 0 ? Math.max(TAIL_MIN, width * g.tail) : 0;
  const day = width - tail;
  if (day <= 0) return null;
  return g.day + Math.max(0, (x / day) * (g.end - g.day));
}

/** What a tap on the ribbon opens (SCREENS.md §2.2): the equation, a term a line, and the segment that was touched. */
export interface RibbonBreakdown {
  /** "9h working", "1h 30m in meetings", "1h 05m buffer (15% of your working day)", "3h 20m planned" */
  terms: readonly string[];
  /** "2h 50m spare", or "40m over" */
  result: string;
  /** The same as one sentence, for a screen reader: "9h working − … = 2h 50m spare". */
  sentence: string;
  /** The segment under a touch `x` points along a ribbon `width` points wide; past the day's end while it spills, the overhang. */
  at: (x: number, width: number) => NamedSegment | null;
}

export interface BreakdownOptions {
  bufferPct: number;
  /** False without a calendar: the equation leaves out the meetings it cannot know. */
  connected: boolean;
  /** Titles for the drawn meetings and blocks. */
  meetings: readonly TimelineMeeting[];
  blocks: readonly TimelineBlock[];
}

/** Null on a day without working hours, which has no ribbon to tap. */
export function ribbonBreakdown(c: Capacity, o: BreakdownOptions): RibbonBreakdown | null {
  if (c.state === "no_work_day" || c.windows.length === 0) return null;
  const { terms, result } = breakdownTerms(c, o.bufferPct, o.connected);
  const segs = ribbonSegments(c, o.meetings, o.blocks);
  return {
    terms,
    result,
    sentence: breakdownSentence(c, o.bufferPct, o.connected),
    at: (x, width) => {
      const minute = minuteAtTouch(c, x, width);
      return minute === null ? null : segmentAt(segs, c, minute);
    },
  };
}
