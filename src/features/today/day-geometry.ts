// The day as any ribbon shape draws it, as numbers alone: where a minute falls along the working day, what has gone,
// the meetings, the unanswered invitations, the blocks, now, the projected finish and the overrun. None of the
// drawing (ribbon-shapes.tsx, ribbon.tsx), so the Android app's ribbon is positioned by the very same sums
// (docs/mobile/ANDROID_APP_SPEC.md §4). ribbon-shapes.tsx hands both names on.
import type { Capacity, Interval } from "@/core/capacity";

/** The over-tail never takes more than this share, as on the standard ribbon. */
const TAIL_MAX = 0.2;

export interface DayGeometry {
  day: number;
  end: number;
  /** Where a minute falls along the day, 0 to 1, clamped. */
  at: (m: number) => number;
  now?: number;
  /** The share of the day already gone. */
  elapsed: number;
  finish?: number;
  /** The overrun as a share of the day, capped; 0 when the plan fits. */
  tail: number;
  busy: readonly Interval[];
  unanswered: readonly Interval[];
  blocks: readonly Interval[];
  /** Whole hours inside the day. */
  hours: number[];
}

export function dayGeometry(c: Capacity, nowMin?: number): DayGeometry {
  const day = c.windows[0].start;
  const end = c.windows[c.windows.length - 1].end;
  const span = end - day;
  const at = (m: number) => Math.min(1, Math.max(0, (m - day) / span));
  const finishMin = c.projectedFinish ? c.projectedFinish.hour * 60 + c.projectedFinish.minute : undefined;
  const hours: number[] = [];
  for (let h = Math.ceil(day / 60) * 60; h <= end; h += 60) hours.push(h);
  return {
    day,
    end,
    at,
    now: nowMin !== undefined && nowMin >= day && nowMin <= end ? nowMin : undefined,
    elapsed: nowMin === undefined ? 0 : at(nowMin),
    finish: finishMin !== undefined && finishMin >= day && finishMin <= end ? finishMin : undefined,
    tail: c.overflowMin > 0 ? Math.min(c.overflowMin / span, TAIL_MAX) : 0,
    busy: c.busy,
    unanswered: c.unanswered ?? [],
    blocks: c.blocks,
    hours,
  };
}
