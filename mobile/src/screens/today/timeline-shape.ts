// Where the Day timeline puts its parts on a phone (SCREENS.md §2.6; the web's is features/today/timeline.tsx): the
// 24 hours top to bottom at the zoom's scale, the hour lines and their labels, the hours outside the working day,
// meetings by name, blocks in their lanes, the free gaps worth naming, the now line, the projected finish and the
// overrun marker. Every minute, lane, gap, name and scale is the web's own (../../../../src/core/blocking,
// features/today/overlap.ts, timeline-geometry.ts, day-minute.ts); only the points a phone draws with are worked out
// here. Its own file, free of the screen, so it is tested plainly.
import { pxPerMinute, type ZoomStep } from "@/core/blocking";
import type { Capacity, Interval } from "@/core/capacity";
import { subtract } from "@/core/capacity/intervals";
import { formatMinutes, formatTime } from "@/core/time";
import type { TimelineBlock, TimelineMeeting } from "@/features/today/hooks/use-today";
import { layoutLanes, type Lane } from "@/features/today/overlap";
import { DAY_MIN, drawnRange, firstFreeAhead, hhmm, meetingTitle, namedGaps, openingMinute, rangeLine } from "@/features/today/timeline-geometry";

/** A slot taller than this carries its time range on a second line, as on the web. */
export const TWO_LINE = 40;
/** The scale of the default zoom, which the label berths are measured against (the web's PX_PER_MIN). */
const DEFAULT_SCALE = 1.1;

export interface Slot {
  top: number;
  height: number;
}

export interface DrawnMeeting extends Slot {
  key: string;
  start: number;
  title: string;
  /** "10:00–11:30 · 1h 30m" on a tall slot, "10:00" on a short one. */
  time: string;
  tall: boolean;
  past: boolean;
  unanswered: boolean;
  lane: Lane | undefined;
}

export interface DrawnBlock extends Slot {
  block: TimelineBlock;
  time: string;
  tall: boolean;
  /** Behind now, or its task is finished: let down, as the web dims it. */
  quiet: boolean;
  lane: Lane | undefined;
  /** What a screen reader hears: "Block: Draft, 10:00 to 11:30, done, locked". */
  says: string;
}

export interface TimelineShape {
  /** Points per minute at this zoom. */
  scale: number;
  height: number;
  /** A line at every hour; its label gives way to the now time or the done-by pill when it would sit under one. */
  hours: { minute: number; top: number; label: string | null }[];
  /** The fainter lines between the hours: one per row of the zoom, with a quiet label at each quarter at the 5-minute zoom. */
  rows: { minute: number; top: number; half: boolean; label: string | null }[];
  /** The hours outside the work windows, the gap between split windows included: dimmed, still usable. */
  outside: Slot[];
  gaps: (Slot & { key: string; label: string })[];
  meetings: DrawnMeeting[];
  blocks: DrawnBlock[];
  /** The working day's end, drawn a shade firmer than an hour line. */
  workEnd: number;
  finish: { top: number; label: string } | null;
  /** The plan runs past the day: pinned under its end, saying by how much. */
  overrun: { top: number; label: string } | null;
  now: { top: number; label: string } | null;
  /** The minute the timeline is first turned to, and the first free stretch still ahead (where a task waiting for a time is shown). */
  openAt: number;
  freeAt: number | null;
}

export interface TimelineInput {
  c: Capacity;
  /** The minute of the day it is (minuteOnDay): 0 before the day, 1440 once it has ended. */
  nowMin: number;
  /** Now falls on the day drawn, so a now line is drawn. */
  nowShown: boolean;
  blocks: readonly TimelineBlock[];
  meetings: readonly TimelineMeeting[];
  zoom: ZoomStep;
}

export function timelineShape({ c, nowMin, nowShown, blocks, meetings, zoom }: TimelineInput): TimelineShape {
  const scale = pxPerMinute(zoom);
  const y = (m: number) => m * scale;
  const workEnd = c.windows[c.windows.length - 1]?.end ?? 17 * 60;
  // Where the day stands: before it starts nothing is past, after it ends everything is.
  const elapsed = Math.min(Math.max(nowMin, 0), DAY_MIN);
  const finishMin = c.projectedFinish ? c.projectedFinish.hour * 60 + c.projectedFinish.minute : null;
  // Whatever overlaps shares the width side by side (SCREENS.md §4), a block dropped on a meeting included.
  const lanes = layoutLanes([...blocks, ...c.busy.map((b, i) => ({ id: `m${i}`, ...b }))]);
  // A label within reach of the now time or the done-by pill gives way to it.
  const reach = 12 / (scale / DEFAULT_SCALE);
  const hidden = (m: number) => (nowShown && Math.abs(m - nowMin) <= reach) || (finishMin !== null && Math.abs(m - finishMin) <= reach + 2);
  const hours = Array.from({ length: 24 }, (_, i) => i * 60).map((minute) => ({ minute, top: y(minute), label: hidden(minute) ? null : hhmm(minute) }));
  const steps = Array.from({ length: 60 / zoom - 1 }, (_, i) => (i + 1) * zoom);
  const rows = hours.flatMap((h) =>
    steps.map((r) => {
      const minute = h.minute + r;
      return { minute, top: y(minute), half: r % 30 === 0, label: zoom === 5 && r % 15 === 0 && !hidden(minute) ? hhmm(minute) : null };
    }),
  );
  const slot = (iv: Interval): Slot => ({ top: y(iv.start), height: (iv.end - iv.start) * scale });
  const opening = drawnRange(c.windows, [...blocks, ...c.busy], nowShown ? nowMin : null);
  const freeAhead = firstFreeAhead(c.free, elapsed);
  return {
    scale,
    height: DAY_MIN * scale,
    hours,
    rows,
    outside: subtract([{ start: 0, end: DAY_MIN }], c.windows).map(slot),
    gaps: namedGaps(c.free, elapsed).map((g) => ({ key: `f${g.start}`, top: y(g.start) + 1, height: (g.end - g.start) * scale - 2, label: `${formatMinutes(g.end - g.start)} free${finishMin !== null && g.start >= finishMin ? " · after the plan" : ""}` })),
    meetings: c.busy.map((b, i) => {
      const height = Math.max(14, (b.end - b.start) * scale - 2);
      const tall = height >= TWO_LINE;
      return {
        key: `m${i}`,
        start: b.start,
        top: y(b.start) + 1,
        height,
        title: meetingTitle(b, meetings),
        time: tall ? rangeLine(b.start, b.end) : hhmm(b.start),
        tall,
        past: b.end <= elapsed,
        // An invitation not yet answered is still busy, hatched like on the ribbon (SYSTEM_DESIGN.md §5.4).
        unanswered: (c.unanswered ?? []).some((u) => u.start <= b.start && u.end >= b.end),
        lane: lanes.get(`m${i}`),
      };
    }),
    blocks: blocks.map((b) => {
      // Never shorter than a touch can find: a 15-minute block draws a little taller than its slot rather than unreachably thin.
      const height = Math.max(24, (b.end - b.start) * scale - 2);
      const tall = height >= TWO_LINE;
      const done = Boolean(b.done);
      return {
        block: b,
        top: y(b.start) + 1,
        height,
        time: tall ? rangeLine(b.start, b.end) : hhmm(b.start),
        tall,
        quiet: b.end <= elapsed || done,
        lane: lanes.get(b.id),
        says: `Block: ${b.title}, ${hhmm(b.start)} to ${hhmm(b.end)}${done ? ", done" : ""}${b.locked ? ", locked" : ""}${b.sync === "will" ? ", will sync" : b.sync === "off" ? ", not synced" : ""}`,
      };
    }),
    workEnd: y(workEnd),
    finish: finishMin !== null && c.projectedFinish ? { top: y(finishMin), label: `done by ${formatTime(c.projectedFinish)}` } : null,
    overrun: c.overflowMin > 0 ? { top: y(workEnd) + 4, label: `${formatMinutes(c.overflowMin)} past the end of your day` } : null,
    now: nowShown ? { top: y(nowMin), label: hhmm(nowMin) } : null,
    openAt: openingMinute(opening, nowShown ? nowMin : null),
    freeAt: freeAhead ? Math.max(freeAhead.start, elapsed) : null,
  };
}

/** A lane as a share of the drawn width: the whole of it, or its part of a cluster of things that overlap. */
export function laneBox(lane: Lane | undefined): { left: `${number}%`; width: `${number}%` } {
  if (!lane || lane.columns <= 1) return { left: "0%", width: "100%" };
  return { left: `${(lane.column / lane.columns) * 100}%`, width: `${100 / lane.columns}%` };
}
