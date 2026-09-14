// The evening shutdown's words and sums (SCREENS.md §15). The point of the
// flow is to stop working, so every line is settled and short. Pure.
import { formatMinutes } from "@/core/time";
import type { Task } from "@/core/types";

export const SHUTDOWN_STEPS = ["done", "carried", "rating", "highlight", "tomorrow", "close"] as const;
export type ShutdownStep = (typeof SHUTDOWN_STEPS)[number];

const things = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;

/** "You finished 7 things — about 4h 20m." */
export function doneLine(done: readonly Task[], defaultEstimateMin: number): string {
  if (done.length === 0) return "Nothing got ticked off today. Some days are like that.";
  const minutes = done.reduce((s, t) => s + (t.estimateMin ?? defaultEstimateMin), 0);
  return `You finished ${things(done.length)} — about ${formatMinutes(minutes)}.`;
}

/** "5 things didn't happen. That's normal." */
export function carriedLine(unfinished: number): string {
  if (unfinished === 0) return "Everything you planned happened. Tomorrow starts clean.";
  return `${things(unfinished)} didn${"’"}t happen. That${"’"}s normal.`;
}

/** "Tomorrow: 4h 10m spare, 3 things already on it." */
export function tomorrowLine(spareMin: number | null, planned: number): string {
  const load = planned === 0 ? "nothing on it yet" : `${things(planned)} already on it`;
  if (spareMin === null) return `Tomorrow: ${load}.`;
  if (spareMin < 0) return `Tomorrow: ${formatMinutes(-spareMin)} over already, ${load}.`;
  return `Tomorrow: ${formatMinutes(spareMin)} spare, ${load}.`;
}

/** The summary Today shows once the day is closed. */
export function closedLine(done: readonly Task[], defaultEstimateMin: number, closedAt: string, rating: number | null): string {
  const minutes = done.reduce((s, t) => s + (t.estimateMin ?? defaultEstimateMin), 0);
  const parts = [`Closed at ${closedAt}`, `${done.length} done`];
  if (done.length > 0) parts.push(formatMinutes(minutes));
  if (rating) parts.push(`rated ${rating}/5`);
  return parts.join(" · ");
}

export function nextStep(step: ShutdownStep): ShutdownStep | null {
  const i = SHUTDOWN_STEPS.indexOf(step);
  return i >= 0 && i < SHUTDOWN_STEPS.length - 1 ? SHUTDOWN_STEPS[i + 1] : null;
}

export function previousStep(step: ShutdownStep): ShutdownStep | null {
  const i = SHUTDOWN_STEPS.indexOf(step);
  return i > 0 ? SHUTDOWN_STEPS[i - 1] : null;
}

/** A rating is 1–5 and nothing else. */
export function isRating(n: number): n is 1 | 2 | 3 | 4 | 5 {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}
