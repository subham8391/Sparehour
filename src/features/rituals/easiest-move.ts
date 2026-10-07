// The morning plan's "easiest move" when the day is over (PRODUCT_SPEC.md §9.4): Today's ribbon names it through the
// over day's island (day-states.tsx), the morning plan in its readout. The "Planned at" label the Today shell shows
// is planned-label.ts, so the shell carries neither this nor the plan's candidate groups (SYSTEM_DESIGN.md §11.6).
import { formatMinutes } from "@/core/time";
import type { Task } from "@/core/types";

export interface EasiestMove {
  task: Task;
  /** "No deadline, and tomorrow has 1h 05m spare. Moving it leaves 10 minutes over — close enough to keep." */
  reason: string;
  leavesOverMin: number;
}

const estimateOf = (t: Task, defaultEstimateMin: number) => t.estimateMin ?? defaultEstimateMin;

/**
 * The largest picked task with no deadline that fits into tomorrow's spare
 * time, with the reason spelled out; null when nothing qualifies.
 */
export function easiestMove(picked: readonly Task[], overMin: number, tomorrowSpareMin: number | null, defaultEstimateMin: number): EasiestMove | null {
  if (overMin <= 0 || tomorrowSpareMin === null) return null;
  const movable = picked
    .filter((t) => !t.deadline && !t.evening && estimateOf(t, defaultEstimateMin) <= tomorrowSpareMin)
    .sort((a, b) => estimateOf(b, defaultEstimateMin) - estimateOf(a, defaultEstimateMin));
  const task = movable[0];
  if (!task) return null;
  const leavesOverMin = Math.max(0, overMin - estimateOf(task, defaultEstimateMin));
  const tail = leavesOverMin === 0 ? "Moving it makes the day fit." : leavesOverMin <= 15 ? `Moving it leaves ${formatMinutes(leavesOverMin)} over — close enough to keep.` : `Moving it leaves ${formatMinutes(leavesOverMin)} over.`;
  return { task, reason: `No deadline, and tomorrow has ${formatMinutes(tomorrowSpareMin)} spare. ${tail}`, leavesOverMin };
}
