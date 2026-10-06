// Today's Sort (SCREENS.md §2.4 "Order"): a view preference over the Today and
// This evening sections. Manual is the hand order (day_sort_key); the others
// order a copy of the list and never write a key, so choosing Manual again
// brings the hand order straight back. Pure.
import { compareDates } from "../time";
import type { Task } from "../types";

export type TodaySort = "manual" | "time" | "priority" | "deadline" | "estimate";

export const TODAY_SORTS: readonly { value: TodaySort; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "time", label: "Time" },
  { value: "priority", label: "Priority" },
  { value: "deadline", label: "Deadline" },
  { value: "estimate", label: "Estimate" },
];

export const isTodaySort = (v: unknown): v is TodaySort => TODAY_SORTS.some((s) => s.value === v);

/** Present before absent, so a sort by a field never buries the rows that have it under the ones that don't. */
const present = <T>(x: T | null, y: T | null, cmp: (x: T, y: T) => number): number => (x !== null && y !== null ? cmp(x, y) : x !== null ? -1 : y !== null ? 1 : 0);

/** Priority is stored 3 (high) · 2 · 1 (low) · 0 (none): high first, none last. */
const COMPARE: Record<Exclude<TodaySort, "manual">, (a: Task, b: Task, defaultEstimateMin: number) => number> = {
  time: (a, b) => present(a.doTime, b.doTime, (x, y) => x.hour * 60 + x.minute - (y.hour * 60 + y.minute)),
  priority: (a, b) => b.priority - a.priority,
  deadline: (a, b) => present(a.deadline, b.deadline, compareDates),
  // Largest first: the big things are the ones the day is shaped around.
  estimate: (a, b, d) => (b.estimateMin ?? d) - (a.estimateMin ?? d),
};

/**
 * The list in the chosen order; ties keep the order it came in (the hand order). A new array: the input is
 * never reordered and nothing is written. Manual returns the list as it is.
 */
export function sortToday<T extends Task>(tasks: readonly T[], sort: TodaySort, defaultEstimateMin = 30): T[] {
  if (sort === "manual") return [...tasks];
  const cmp = COMPARE[sort];
  const at = new Map(tasks.map((t, i) => [t.id, i]));
  return [...tasks].sort((a, b) => cmp(a, b, defaultEstimateMin) || (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0));
}
