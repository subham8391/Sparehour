// The evening shutdown's words and sums (SCREENS.md §15). The point of the
// flow is to stop working, so every line is settled and short. Pure.
import { compareDates, formatMinutes, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";

export const SHUTDOWN_STEPS = ["done", "carried", "rating", "highlight", "tomorrow", "close"] as const;
export type ShutdownStep = (typeof SHUTDOWN_STEPS)[number];

const things = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;

/**
 * What became of an unfinished task in step 2 (PRODUCT_SPEC.md §12.2): moved to tomorrow, parked, dropped, kept
 * for today — or, if it changed some other way meanwhile, done or moved to another day.
 */
export type CarryOutcome = "tomorrow" | "someday" | "dropped" | "kept" | "done" | "moved";

/** The four answers a row of step 2 offers (SCREENS.md §15): Tomorrow · Someday · Drop · Keep for today. */
export type CarryChoice = "tomorrow" | "someday" | "drop" | "keep";

/** A row of step 2: the task as it was when the shutdown opened, and its outcome; null while it waits (it carries by default). */
export interface CarryRow {
  task: Task;
  outcome: CarryOutcome | null;
}

export const OUTCOME_LABEL: Record<CarryOutcome, string> = {
  tomorrow: "Moved to tomorrow",
  someday: "Moved to Someday",
  dropped: "Dropped",
  kept: "Kept for today",
  done: "Done",
  moved: "Moved",
};

/**
 * The outcome read from the task's live row, so an undo puts the row back to waiting. "Kept for today" writes
 * nothing (the task simply stays), so it is the person's word for a task still on today. A row the device no
 * longer has is left as it was.
 */
export function carryOutcome(live: Task | undefined, today: LocalDate, kept: boolean): CarryOutcome | null {
  if (!live) return kept ? "kept" : null;
  if (live.state === "done") return "done";
  if (live.state === "someday") return "someday";
  if (live.state === "dropped" || live.state === "archived") return "dropped";
  const tomorrow = today.add({ days: 1 });
  if (live.doDate?.equals(tomorrow)) return "tomorrow";
  if (!live.doDate || compareDates(live.doDate, tomorrow) > 0) return "moved";
  return kept ? "kept" : null;
}

/** What goes on to tomorrow: the rows moved there, and the ones left waiting, which carry by default. */
export function carriedToTomorrow(rows: readonly CarryRow[]): number {
  return rows.filter((r) => r.outcome === null || r.outcome === "tomorrow").length;
}

/** "You finished 7 things — about 4h 20m." */
export function doneLine(done: readonly Task[], defaultEstimateMin: number): string {
  if (done.length === 0) return "Nothing got ticked off today. Some days are like that.";
  const minutes = done.reduce((s, t) => s + (t.estimateMin ?? defaultEstimateMin), 0);
  return `You finished ${things(done.length)} — about ${formatMinutes(minutes)}.`;
}

/** "5 things didn't happen. That's normal." Counted from the list as it was when the shutdown opened, whatever has been moved since. */
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

export interface LedgerRow {
  label: string;
  value: string;
  /** `spare` and `over` are tomorrow's colours; `quiet` is a fact that is absent ("Not rated"). */
  tone?: "spare" | "over" | "quiet";
}

/**
 * The closing moment's ledger (brief §1): what was done, what moves, the
 * rating, the highlight and tomorrow, as facts in a fixed order. Nothing
 * here cheers. `carried` is what goes on to tomorrow (`carriedToTomorrow`):
 * moved there or left to carry, not parked, dropped or kept for today.
 */
export function closingLedger(p: { done: readonly Task[]; carried: number; defaultEstimateMin: number; rating: number | null; highlight: string; tomorrow: { spareMin: number | null; planned: number } }): LedgerRow[] {
  const minutes = p.done.reduce((s, t) => s + (t.estimateMin ?? p.defaultEstimateMin), 0);
  const rows: LedgerRow[] = [
    { label: "Done", value: p.done.length === 0 ? "Nothing" : `${things(p.done.length)} · ${formatMinutes(minutes)}` },
    { label: "Carried to tomorrow", value: p.carried === 0 ? "Nothing" : things(p.carried) },
    p.rating ? { label: "Day rating", value: `${p.rating} / 5` } : { label: "Day rating", value: "Not rated", tone: "quiet" },
  ];
  if (p.highlight.trim()) rows.push({ label: "Worth it", value: p.highlight.trim() });
  const spare = p.tomorrow.spareMin;
  if (spare !== null) rows.push(spare < 0 ? { label: "Tomorrow", value: `${formatMinutes(-spare)} over already`, tone: "over" } : { label: "Tomorrow", value: `${formatMinutes(spare)} spare`, tone: "spare" });
  return rows;
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
