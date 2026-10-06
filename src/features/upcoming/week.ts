// The week planner's rules (SCREENS.md §3 and §6, DESIGN_SYSTEM.md §4a),
// pure so each one is unit-tested: which seven days are on screen, how they
// become columns in each width band, what a day's capacity readout says, the
// week total, the words quick add opens with for a day, and where the
// keyboard goes between columns.
import type { Capacity } from "@/core/capacity";
import { compareDates, formatMinutes, type LocalDate } from "@/core/time";
import { monthName } from "@/core/time/format-day";
import { heroState } from "@/features/today/ribbon";

export const WEEK_DAYS = 7;

/** "rolling": the next seven days from today. "calendar": the week that holds today, on the person's week start. */
export type WeekMode = "rolling" | "calendar";

/** The first day of the week holding `day`; `weekStart` is user_settings.week_start, 0 = Monday … 6 = Sunday. */
export function startOfWeek(day: LocalDate, weekStart: number): LocalDate {
  const first = (((Math.trunc(weekStart) % 7) + 7) % 7) + 1; // as an ISO weekday, 1 = Monday
  return day.subtract({ days: (day.dayOfWeek - first + 7) % 7 });
}

/** `[` and `]` step a whole week, never back past the week that holds today (DECISIONS.md, M1 gap rulings). */
export function clampOffset(offset: number): number {
  return Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
}

/** The seven days on screen: from today, or from the start of this week, `offset` weeks on. */
export function weekWindow(today: LocalDate, mode: WeekMode, weekStart: number, offset: number): LocalDate[] {
  const first = (mode === "calendar" ? startOfWeek(today, weekStart) : today).add({ days: WEEK_DAYS * clampOffset(offset) });
  return Array.from({ length: WEEK_DAYS }, (_, i) => first.add({ days: i }));
}

/**
 * The width bands (DESIGN_SYSTEM.md §4a): stacked days on a phone, three columns that scroll in the narrow
 * band, five weekdays and a folded weekend in the medium one, all seven and the rail from 1180 px. The band
 * follows the viewport, stepped down when the planner itself has less room than the band assumes — the
 * detail pane takes 384 px beside it from 900 px up.
 */
export type WeekBand = "phone" | "narrow" | "medium" | "wide";
const BANDS: readonly WeekBand[] = ["phone", "narrow", "medium", "wide"];
/** The planner's own width at the narrowest viewport of each band, with the full sidebar and the view padding. */
export const MIN_CONTENT = { medium: 560, wide: 860 } as const;

export function weekBand(viewport: number, content: number): WeekBand {
  if (viewport < 640) return "phone";
  const byViewport: WeekBand = viewport >= 1180 ? "wide" : viewport >= 900 ? "medium" : "narrow";
  const byContent: WeekBand = content >= MIN_CONTENT.wide ? "wide" : content >= MIN_CONTENT.medium ? "medium" : "narrow";
  return BANDS[Math.min(BANDS.indexOf(byViewport), BANDS.indexOf(byContent))];
}

/** One column of the planner: a day, or a Saturday and the Sunday after it folded together. */
export interface WeekColumn<T> {
  key: string;
  days: T[];
}

/** Days as columns. With `foldWeekend` (the medium band) a Saturday shares its column with the Sunday right after it. */
export function weekColumns<T>(days: readonly T[], dayOf: (d: T) => LocalDate, foldWeekend: boolean): WeekColumn<T>[] {
  const out: WeekColumn<T>[] = [];
  for (let i = 0; i < days.length; i++) {
    const day = dayOf(days[i]);
    const next = days[i + 1];
    if (foldWeekend && day.dayOfWeek === 6 && next !== undefined && dayOf(next).dayOfWeek === 7) {
      out.push({ key: day.toString(), days: [days[i], next] });
      i++;
    } else out.push({ key: day.toString(), days: [days[i]] });
  }
  return out;
}

/** A day's one-line capacity readout (SCREENS.md §3): "3h 20m spare", "40m over", "no working hours". */
export interface DayReadout {
  kind: "spare" | "over" | "off";
  min: number;
  text: string;
}

/**
 * Today's readout is the hero's own state (`heroState`), so the week and Today never show two figures for the
 * same day; any other day reads its spare time, or how far its plan runs past its capacity.
 */
export function dayReadout(c: Capacity, isToday: boolean): DayReadout {
  if (c.state === "no_work_day") return { kind: "off", min: 0, text: c.reason === "out_of_office" ? "out of office" : "no working hours" };
  const over = isToday ? heroState(c).over : c.spareMin < 0;
  const min = isToday ? heroState(c).min : Math.abs(c.spareMin);
  return over ? { kind: "over", min, text: `${formatMinutes(min)} over` } : { kind: "spare", min, text: `${formatMinutes(min)} spare` };
}

/** "This week" only for the week that holds today; a stepped week is "that week". */
export function weekTotalLine(readouts: readonly (DayReadout | null)[], current: boolean): string {
  const when = current ? "this week" : "that week";
  if (readouts.every((r) => r === null || r.kind === "off")) return `No working hours ${when}`;
  // An over day adds nothing rather than taking away: the total is the room left on the days that have some.
  const spare = readouts.reduce((sum, r) => sum + (r?.kind === "spare" ? r.min : 0), 0);
  return `${formatMinutes(spare)} spare ${when}`;
}

/** What quick add opens with from a day's "+ Add": words the parser reads back as that day. */
export function dayPrefill(day: LocalDate, today: LocalDate): string {
  const ahead = day.since(today, { largestUnit: "days" }).days;
  if (ahead === 0) return "today ";
  if (ahead === 1) return "tomorrow ";
  return `${day.day} ${monthName(day)} `;
}

/** `←` / `→` move a task a day, never onto a day already gone. */
export function shiftDay(day: LocalDate, delta: number, today: LocalDate): LocalDate | null {
  const next = day.add({ days: delta });
  return compareDates(next, today) < 0 ? null : next;
}

/** Where `J` / `K` go inside a column: the next row in it, held at its ends; null when the row is in no column. */
export function stepInColumn(columns: readonly (readonly string[])[], selectedId: string | null, delta: 1 | -1): string | null {
  if (!selectedId) return null;
  const column = columns.find((c) => c.includes(selectedId));
  if (!column) return null;
  const at = column.indexOf(selectedId);
  return column[Math.min(column.length - 1, Math.max(0, at + delta))];
}

/**
 * Where `Tab` goes between columns: the row at the same height in the nearest column that has rows, or its last
 * row when shorter. Null at either end, so Tab carries on to the rest of the page and nobody is trapped.
 */
export function neighbourColumn(columns: readonly (readonly string[])[], selectedId: string | null, delta: 1 | -1): string | null {
  if (!selectedId) return null;
  const from = columns.findIndex((c) => c.includes(selectedId));
  if (from === -1) return null;
  const at = columns[from].indexOf(selectedId);
  for (let i = from + delta; i >= 0 && i < columns.length; i += delta) {
    const column = columns[i];
    if (column.length > 0) return column[Math.min(at, column.length - 1)];
  }
  return null;
}
