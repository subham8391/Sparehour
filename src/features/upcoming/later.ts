// Upcoming past its first seven days (SCREENS.md §6): dated tasks keep going,
// grouped by day under "Later this month", "Next month", then month names;
// tasks hidden by a start date sit in a collapsed "Starting later" group on
// the day they start (PRODUCT_SPEC.md §7); and a task whose deadline falls on
// a day it is not planned for sits in that day's thin "Due" group, so a
// deadline is never a surprise. Pure.
import { compareDates, type LocalDate } from "@/core/time";
import { monthName } from "@/core/time/format-day";
import type { Task } from "@/core/types";

export interface AgendaDay {
  day: LocalDate;
  tasks: Task[];
  /** Tasks whose start date is this day: hidden until then, listed collapsed. */
  startingLater: Task[];
  /** Open tasks due this day and planned for another day, or for none. */
  due: Task[];
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

/** Tasks by one of their dates, keyed by the ISO day, for the week's own days. */
function byDate(tasks: readonly Task[], dateOf: (t: Task) => LocalDate | null): Map<string, Task[]> {
  const out = new Map<string, Task[]>();
  for (const t of tasks) {
    const day = dateOf(t);
    if (!day) continue;
    const key = day.toString();
    out.set(key, [...(out.get(key) ?? []), t]);
  }
  return out;
}

/** Tasks by the day they start. */
export const startingByDay = (tasks: readonly Task[]) => byDate(tasks, (t) => t.startDate);

/** Tasks by the day they are due; a task due on its own do-date is listed there already, so it is left out. */
export const dueByDay = (tasks: readonly Task[]) => byDate(tasks, (t) => (t.deadline && !(t.doDate && t.doDate.equals(t.deadline)) ? t.deadline : null));

/**
 * Everything after `weekEnd` (the week's last day), by month group then by day, in date order: the tasks dated on
 * each day, the tasks that start on it and the tasks due on it.
 */
export function laterGroups(dated: readonly Task[], starting: readonly Task[], today: LocalDate, weekEnd: LocalDate, due: readonly Task[] = []): LaterGroup[] {
  const byDay = new Map<string, AgendaDay>();
  const dayFor = (day: LocalDate) => {
    const key = day.toString();
    let entry = byDay.get(key);
    if (!entry) {
      entry = { day, tasks: [], startingLater: [], due: [] };
      byDay.set(key, entry);
    }
    return entry;
  };
  const after = (d: LocalDate | null): d is LocalDate => d !== null && compareDates(d, weekEnd) > 0;
  for (const t of dated) if (after(t.doDate)) dayFor(t.doDate).tasks.push(t);
  for (const t of starting) if (after(t.startDate)) dayFor(t.startDate).startingLater.push(t);
  for (const [, tasks] of dueByDay(due)) for (const t of tasks) if (after(t.deadline)) dayFor(t.deadline).due.push(t);

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
