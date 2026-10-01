// What the Plan my day preview hands the timeline to draw (SCREENS.md §2.6):
// the proposed blocks as ghosts, the free time the proposal leaves, and the
// plan's own earlier blocks it would replace (hidden while previewing). Types
// only, so the shell can draw a proposal without loading the scheduler.
import type { Interval } from "@/core/capacity";

export type PlanMode = "plan" | "replan";

export interface PlanGhost {
  key: string;
  title: string;
  start: number;
  end: number;
}

export interface PlanDrawing {
  ghosts: readonly PlanGhost[];
  free: readonly Interval[];
  replacedIds: readonly string[];
}

/** Two drawings that would paint the same, so a re-render with an equal proposal does not repaint. */
export function sameDrawing(a: PlanDrawing | null, b: PlanDrawing | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The header button's words: re-plan once the working day has started and the plan has blocks on it. */
export function planMode(nowMin: number, dayStartMin: number, hasPlanBlocks: boolean): PlanMode {
  return nowMin >= dayStartMin && hasPlanBlocks ? "replan" : "plan";
}

export const PLAN_LABEL: Record<PlanMode, string> = { plan: "Plan my day", replan: "Re-plan the rest of today" };
