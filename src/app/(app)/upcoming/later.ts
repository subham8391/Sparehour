// Upcoming past its first seven days (SCREENS.md §6): dated tasks keep going,
// grouped by day under "Later this month", "Next month", then month names;
// and tasks hidden by a start date sit in a collapsed "Starting later" group
// on the day they start (PRODUCT_SPEC.md §7). Pure.
import { compareDates, type LocalDate } from "@/core/time";
import { monthName } from "@/core/time/format-day";
import type { Task } from "@/core/types";

export interface AgendaDay {
  day: LocalDate;
  tasks: Task[];
  /** Tasks whose start date is this day: hidden until then, listed collapsed. */
  startingLater: Task[];
}

export interface LaterGroup {
  /** The month, "2026-11", as a stable key. */
  key: string;
  label: string;
  days: AgendaDay[];
}

/** "Later this month", "Next month", else the month's name (with the year once it is not this year's). */
export function laterLabel(day: LocalDate, today: LocalDate): string {
  const month = day.toPlainYearMonth();
  const current = today.toPlainYearMonth();
  if (month.equals(current)) return "Later this month";
  if (month.equals(current.add({ months: 1 }))) return "Next month";
  return day.year === today.year ? monthName(day, "long") : `${monthName(day, "long")} ${day.year}`;
}

/** Tasks by the day they start, for the rolling week's own days. */
export function startingByDay(tasks: readonly Task[]): Map<string, Task[]> {
  const out = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.startDate) continue;
    const key = t.startDate.toString();
    out.set(key, [...(out.get(key) ?? []), t]);
  }
  return out;
}

/**
 * Everything after `weekEnd` (the rolling week's last day), by month group then by day, in date order:
 * the tasks dated on each day, and the tasks that start on it.
 */
export function laterGroups(dated: readonly Task[], starting: readonly Task[], today: LocalDate, weekEnd: LocalDate): LaterGroup[] {
  const byDay = new Map<string, AgendaDay>();
  const dayFor = (day: LocalDate) => {
    const key = day.toString();
    let entry = byDay.get(key);
    if (!entry) {
      entry = { day, tasks: [], startingLater: [] };
      byDay.set(key, entry);
    }
    return entry;
  };
  for (const t of dated) if (t.doDate && compareDates(t.doDate, weekEnd) > 0) dayFor(t.doDate).tasks.push(t);
  for (const t of starting) if (t.startDate && compareDates(t.startDate, weekEnd) > 0) dayFor(t.startDate).startingLater.push(t);

  const groups: LaterGroup[] = [];
  for (const entry of [...byDay.values()].sort((a, b) => compareDates(a.day, b.day))) {
    const key = entry.day.toPlainYearMonth().toString();
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: laterLabel(entry.day, today), days: [] };
      groups.push(group);
    }
    group.days.push(entry);
  }
  return groups;
}
