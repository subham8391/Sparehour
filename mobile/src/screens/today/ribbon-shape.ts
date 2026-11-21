// Where the ribbon puts its parts on a phone (SCREENS.md §2.2; the web's is features/today/ribbon.tsx): the working
// day from its first hour to its last, with meetings, unanswered invitations and blocks at their own hours, what has
// gone, the now mark, the projected finish, the hour ticks and the one label row under them. Every position is the
// web's own geometry (../../../../src/features/today/day-geometry.ts) and every label, with the rule for which hour
// gives way to a cursor's time, is the web's own (ribbon-words.ts); only the percentages a phone draws with are
// worked out here. Its own file, free of the screen, so it is tested plainly.
import type { Capacity } from "@/core/capacity";
import { dayGeometry } from "@/features/today/day-geometry";
import { ribbonLabels, type RibbonLabel } from "@/features/today/ribbon-words";

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
