// Human dates for chips (DESIGN_SYSTEM.md §5 "Chips"): "Today", "Tomorrow",
// "Fri", "22 Sep", and for a deadline that has passed "2d late". Pure, so
// every list can share one wording.
import { compareDates, type LocalDate } from "@/core/time";
import { formatDay, weekdayName } from "@/core/time/format-day";

/** Whole days from `today` to `date`; negative when it has passed. */
export function daysFromToday(date: LocalDate, today: LocalDate): number {
  return date.since(today, { largestUnit: "days" }).days;
}

/** "Today", "Tomorrow", "Yesterday", a weekday inside the week, else "22 Sep" (with the year when it differs). */
export function relativeDay(date: LocalDate, today: LocalDate): string {
  const days = daysFromToday(date, today);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days < 7) return weekdayName(date);
  return formatDay(date, { weekday: "none", today });
}

export interface DeadlineWording {
  label: string;
  /** Today, passed, or within two days: the chip takes the ember tint. Otherwise it stays neutral with the flag. */
  near: boolean;
}

/** Deadline chips: ember only when it matters (D3), "2d late" once it has passed, never "overdue". */
export function deadlineWording(deadline: LocalDate, today: LocalDate): DeadlineWording {
  const days = daysFromToday(deadline, today);
  if (compareDates(deadline, today) < 0) return { label: `${-days}d late`, near: true };
  return { label: relativeDay(deadline, today), near: days <= 2 };
}
