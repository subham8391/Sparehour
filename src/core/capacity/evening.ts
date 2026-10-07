// This Evening's own budget (PRODUCT_SPEC.md §9.1; M1 gap rulings 2026-10-06 "Evening budget"). A module of its
// own, apart from the daytime calculator, so Today's first download does not carry it: the This Evening island
// and the morning plan import it.
//
//   evening = cut-off − end of the day's last work segment      (no buffer; never below zero)
//
// On a day without working hours the evening starts at the evening start. A 00:00 cut-off is midnight.
import { minutesOfDay, type LocalTime } from "../time";
import type { Interval } from "./intervals";

export interface EveningBudget {
  /** Minutes of the day the evening starts and ends. */
  startMin: number;
  endMin: number;
  budgetMin: number;
  plannedMin: number;
  /** Planned past the budget: "That's a full evening." */
  full: boolean;
}

/** Where the evening starts: the end of the day's last work window, or the evening start without one. */
export function eveningStartMin(windows: readonly Interval[], eveningStartsAt: LocalTime): number {
  return windows.length > 0 ? windows[windows.length - 1].end : minutesOfDay(eveningStartsAt);
}

/** `windows` are the day's work windows (Capacity.windows); `plannedMin` what the evening tasks add up to. */
export function eveningBudget(p: { windows: readonly Interval[]; eveningStartsAt: LocalTime; eveningEndsAt: LocalTime; plannedMin: number }): EveningBudget {
  const startMin = eveningStartMin(p.windows, p.eveningStartsAt);
  const endMin = minutesOfDay(p.eveningEndsAt) || 24 * 60;
  const budgetMin = Math.max(0, endMin - startMin);
  return { startMin, endMin, budgetMin, plannedMin: p.plannedMin, full: p.plannedMin > budgetMin };
}
