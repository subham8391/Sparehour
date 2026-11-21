// What Upcoming shows, worked out apart from how it is drawn (SCREENS.md §3, §6): the week's days with their tasks,
// capacity and readout, which days the phone's agenda stacks and folds, the header's range, the day cells' names and
// the days capacity is asked for. Pure, and free of the web's screen parts, so the page (app/(app)/upcoming) and the
// Android app's Week tab build the same week from the same rows (docs/mobile/ANDROID_APP_SPEC.md §4).
import type { Capacity } from "@/core/capacity";
import { compareDates, type LocalDate } from "@/core/time";
import { formatDay, weekdayName } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import { dueByDay, startingByDay, type AgendaDay } from "./later";
import { dayReadout, type DayReadout } from "./week";

/** Capacity readouts reach this many days ahead (SCREENS.md §6). */
export const READOUT_DAYS = 14;

/** One of the week's days as it is drawn: a column from the narrow band up, a stacked day on a phone. */
export interface ColumnDay extends AgendaDay {
  isToday: boolean;
  /** Before today: the calendar week's first days, shown for what is still dated there. */
  past: boolean;
  capacity: Capacity | null;
  readout: DayReadout | null;
}

/** One cell of the 7-day strip. */
export interface StripDay {
  day: LocalDate;
  isToday: boolean;
  capacity: Capacity | null;
  readout: DayReadout | null;
}

/** "Thu 17": a day as its column, its stacked header and its cell name it. */
export const dayLabel = (d: { day: AgendaDay["day"] }) => `${weekdayName(d.day)} ${d.day.day}`;

/** "Tue 6 – Mon 12 October", or "Wed 28 Oct – Tue 3 Nov" across a month. */
export function rangeTitle(first: LocalDate, last: LocalDate, today: LocalDate): string {
  if (first.month === last.month && first.year === last.year) return `${weekdayName(first)} ${first.day} – ${formatDay(last, { month: "long", today })}`;
  return `${formatDay(first, { today })} – ${formatDay(last, { today })}`;
}

/** "1 hour 5 minutes", "20 minutes", "2 hours": a duration as it is spoken. */
export function spokenMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hours = h === 0 ? "" : h === 1 ? "1 hour" : `${h} hours`;
  const minutes = m === 0 ? "" : m === 1 ? "1 minute" : `${m} minutes`;
  return [hours, minutes].filter(Boolean).join(" ") || "0 minutes";
}

/** A day's readout in words: "3 hours 20 minutes spare", "20 minutes over", "no working hours". */
export function spokenReadout(r: DayReadout): string {
  if (r.kind === "off") return r.text;
  return `${spokenMinutes(r.min)} ${r.kind}`;
}

/** The cell's accessible name: "Thu 17, today, 20 minutes over". */
export function stripCellName(d: StripDay): string {
  return [`${weekdayName(d.day)} ${d.day.day}`, d.isToday ? "today" : null, d.readout ? spokenReadout(d.readout) : null].filter(Boolean).join(", ");
}

/** The days capacity is worked out for: the week's days from today on, and every day out to day 14 for the agenda's readouts. */
export function capacityRange(first: LocalDate, last: LocalDate, today: LocalDate): { from: LocalDate; to: LocalDate } {
  const readoutEnd = today.add({ days: READOUT_DAYS - 1 });
  return { from: compareDates(first, today) < 0 ? today : first, to: compareDates(last, readoutEnd) > 0 ? last : readoutEnd };
}

/** A day's readout from the capacity worked out for it; none for a day already gone, or one not worked out. */
export function readoutOn(capacity: ReadonlyMap<string, Capacity>, day: LocalDate, today: LocalDate): DayReadout | null {
  const c = capacity.get(day.toString());
  return c && compareDates(day, today) >= 0 ? dayReadout(c, day.equals(today)) : null;
}

/** A day past the week: a compact readout while the day is within the next two weeks. */
export function laterReadout(capacity: ReadonlyMap<string, Capacity>, day: LocalDate, today: LocalDate): DayReadout | null {
  return compareDates(day, today.add({ days: READOUT_DAYS - 1 })) <= 0 ? readoutOn(capacity, day, today) : null;
}

/** The week's days, each with the tasks planned on it, the ones starting and the ones due that day, its capacity and its readout. */
export function weekDays(windowDays: readonly LocalDate[], today: LocalDate, planned: readonly Task[], starting: readonly Task[], due: readonly Task[], capacity: ReadonlyMap<string, Capacity>): ColumnDay[] {
  const byDay = new Map<string, Task[]>();
  for (const t of planned) {
    const key = t.doDate?.toString() ?? "";
    byDay.set(key, [...(byDay.get(key) ?? []), t]);
  }
  const startsOn = startingByDay(starting);
  const dueOn = dueByDay(due);
  return windowDays.map((day) => {
    const iso = day.toString();
    const past = compareDates(day, today) < 0;
    return {
      day,
      tasks: byDay.get(iso) ?? [],
      startingLater: startsOn.get(iso) ?? [],
      due: dueOn.get(iso) ?? [],
      isToday: day.equals(today),
      past,
      capacity: past ? null : (capacity.get(iso) ?? null),
      readout: readoutOn(capacity, day, today),
    };
  });
}

/** "Nothing scheduled beyond today." (SCREENS.md §21): no day after today has anything. */
export function nothingAhead(days: readonly ColumnDay[]): boolean {
  return days.every((d) => d.isToday || d.past || (d.tasks.length === 0 && d.startingLater.length === 0));
}

/** The days the phone stacks: a day already gone only for what is still dated or due there. */
export function agendaDays(days: readonly ColumnDay[]): ColumnDay[] {
  return days.filter((d) => !d.past || d.tasks.length > 0 || d.due.length > 0);
}

/** A day with nothing planned, starting or due: one of a run of these folds into a line of day cells. */
export function isFreeDay(d: AgendaDay): boolean {
  return d.tasks.length === 0 && d.startingLater.length === 0 && d.due.length === 0;
}

/** What a day's tasks come to, a task without an estimate counted at the account's default. */
export function plannedMinutes(tasks: readonly Task[], defaultEstimateMin: number): number {
  return tasks.reduce((s, t) => s + (t.estimateMin ?? defaultEstimateMin), 0);
}

/** The next seven days from today, for the "Not yet planned" sheet's per-task cells; their bars come from the same capacity. */
export function nextSevenDays(today: LocalDate, capacity: ReadonlyMap<string, Capacity>): StripDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = today.add({ days: i });
    return { day, isToday: i === 0, capacity: capacity.get(day.toString()) ?? null, readout: readoutOn(capacity, day, today) };
  });
}
