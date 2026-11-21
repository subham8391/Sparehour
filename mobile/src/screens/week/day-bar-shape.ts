// Where a day's capacity bar puts its parts (the web's DayBar, ../../../../src/features/upcoming/capacity-bar.tsx, in
// the phone's own measure): the working day as a track from its first hour to its last, meetings and blocks at their
// own hours, and a tail past the end for a day that is over. Every minute is one the shared capacity engine gave and
// every figure is the shared readout's; only the percentages a phone draws with are worked out here. Its own file,
// free of the screen, so it is tested plainly.
import type { Capacity } from "@/core/capacity";
import type { DayReadout } from "@/features/upcoming/week";

/** As on the web: a wild overrun never takes more than a fifth of the bar. */
const TAIL_MAX_PCT = 20;

export interface BarSegment {
  kind: "meeting" | "block";
  /** From the track's near edge, and how wide, each as a share of 100. */
  left: number;
  width: number;
}

export type BarShape = { kind: "off" } | { kind: "spare" | "over"; segments: BarSegment[]; /** The over-tail's share of 100; 0 for none. */ tail: number };

export function dayBarShape(c: Capacity, readout: DayReadout): BarShape {
  if (c.state === "no_work_day" || c.windows.length === 0) return { kind: "off" };
  const start = c.windows[0].start;
  const span = c.windows[c.windows.length - 1].end - start;
  const part = (kind: BarSegment["kind"]) => (b: { start: number; end: number }) => ({ kind, left: ((b.start - start) / span) * 100, width: ((b.end - b.start) / span) * 100 });
  return {
    kind: readout.kind === "over" ? "over" : "spare",
    segments: [...c.busy.map(part("meeting")), ...c.blocks.map(part("block"))],
    tail: readout.kind === "over" ? Math.min((readout.min / span) * 100, TAIL_MAX_PCT) : 0,
  };
}
