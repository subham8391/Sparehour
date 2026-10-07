// The two pieces of the morning plan Today shows in its header and ribbon (SCREENS.md §2.1, PRODUCT_SPEC.md §9.4):
// the "easiest move" when the day is over, and the "Planned at" label. Kept apart from morning-plan.ts so the
// Today shell carries only these, not the plan's candidate groups and readout (SYSTEM_DESIGN.md §11.6).
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

/** "Planned at 8:42" for the Today header. */
export function plannedLabel(time: string): string {
  return `Planned at ${time}`;
}
