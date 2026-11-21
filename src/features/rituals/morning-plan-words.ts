// The morning plan's words and small rules that its screen draws (SCREENS.md §14), alone: the step titles, the
// sentences under them, the estimate presets, the pinned summary, which picked tasks still want a time, and step 3's
// spare line. None of the flow's drawing or keys (morning-plan-flow.tsx), so the Android app says and decides the
// same things as the web does (docs/mobile/ANDROID_APP_SPEC.md §4). The arithmetic is morning-plan.ts.
import { formatMinutes, formatTime, timeFromMinutes } from "@/core/time";
import type { Task } from "@/core/types";
import { PLAN_STEPS, type PlanStep, type Readout } from "./morning-plan";

export const PLAN_TITLES: Record<PlanStep, string> = { frame: "Here’s your day", pick: "Pick today’s tasks", block: "Block time" };
/** The step titles in order, for the strip's "Step n: title" buttons. */
export const PLAN_STEP_LABELS = PLAN_STEPS.map((s) => PLAN_TITLES[s]);

/** The estimate presets, as the detail offers them. */
export const PLAN_ESTIMATES = [15, 25, 30, 45, 60, 90, 120];

/** "From your projects" shows this many until More is pressed. */
export const PROJECTS_SHOWN = 6;

/** The sentence under each of the first two steps' titles. */
export const FRAME_LEAD = "Nothing to do here but read. The next step is the only decision of the morning.";
export const PICK_LEAD = "Tick what you’ll work on. Everything else waits without turning red.";
/** Added to step 3's sentence where Plan my day is offered. */
export const PLAN_MY_DAY_LEAD = "Plan my day proposes blocks for today’s tasks around your meetings, and nothing changes until you approve.";
/** Step 3 on a day without working hours. */
export const NO_HOURS_LINE = "No working hours today.";

/** The footer's one action on each step. */
export function primaryLabel(step: PlanStep): string {
  return step === "block" ? "Done" : step === "frame" ? "Next" : "Next · Block time";
}

/** Step 2's note (SCREENS.md §14): evening tasks stay out of the readout, and the note says what they add up to after work. */
export function eveningNote(onToday: readonly Task[], defaultEstimateMin: number, startMin: number | null): string {
  const planned = onToday.filter((t) => t.evening).reduce((sum, t) => sum + (t.estimateMin ?? defaultEstimateMin), 0);
  if (planned === 0 || startMin === null) return "Evening tasks aren’t counted here — they get their own time after work.";
  return `Evening tasks aren’t counted here — they get their own ${formatMinutes(planned)} after ${formatTime(timeFromMinutes(startMin))}.`;
}

/** The phone's pinned summary (SCREENS.md §14 Responsive): "5h 40m fits today · 6h 20m picked · 7 tasks". */
export function pickSummary(r: Pick<Readout, "fitsMin" | "pickedMin" | "count">): string {
  return `${formatMinutes(r.fitsMin)} fits today · ${formatMinutes(r.pickedMin)} picked · ${r.count} ${r.count === 1 ? "task" : "tasks"}`;
}

/** What leads the pinned summary on a day that is over: "40m over · "; nothing when the day fits. */
export function overLead(r: Pick<Readout, "overMin">): string {
  return r.overMin > 0 ? `${formatMinutes(r.overMin)} over · ` : "";
}

/** Step 3's list: the picked daytime tasks that have no block on the day yet. */
export function toBlockTasks(onToday: readonly Task[], blocks: readonly { taskId: string | null }[]): Task[] {
  const blockedIds = new Set(blocks.flatMap((b) => (b.taskId ? [b.taskId] : [])));
  return onToday.filter((t) => !t.evening && !blockedIds.has(t.id));
}

/** Step 3's spare figure, which follows every block placed: "3h 20m spare", or "40m over". */
export function spareFigure(spareMin: number): string {
  return spareMin < 0 ? `${formatMinutes(-spareMin)} over` : `${formatMinutes(spareMin)} spare`;
}

/** Beside it: how many picked tasks still want a time. */
export function toBlockWords(count: number): string {
  return count === 0 ? "everything picked has a time" : `${count} to block`;
}
