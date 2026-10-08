// The Calendar's rules (SCREENS.md §4, DESIGN_SYSTEM.md §4a), pure so each one is unit-tested: which days a mode
// shows around the day it is anchored on, how `[` / `]` step it, the width band and the mode that band allows, how
// the days become columns, which day answers `B`, and the range's title.
import { compareDates, type LocalDate } from "@/core/time";
import { formatDay, weekdayName } from "@/core/time/format-day";
import { startOfWeek } from "@/features/upcoming/week";
import type { CalendarMode } from "./calendar-mode";

/**
 * The days on screen. Day: the day itself. Work week: Monday to Friday of the week holding it. Week: seven days from
 * the person's week start (user_settings.week_start, 0 = Monday … 6 = Sunday).
 */
export function visibleDays(anchor: LocalDate, mode: CalendarMode, weekStart: number): LocalDate[] {
  if (mode === "day") return [anchor];
  if (mode === "workweek") {
    const monday = anchor.subtract({ days: anchor.dayOfWeek - 1 });
    return Array.from({ length: 5 }, (_, i) => monday.add({ days: i }));
  }
  const first = startOfWeek(anchor, weekStart);
  return Array.from({ length: 7 }, (_, i) => first.add({ days: i }));
}

/** `[` / `]` (SCREENS.md §24): a day in the Day mode, a week in the week modes. */
export function stepAnchor(anchor: LocalDate, mode: CalendarMode, delta: 1 | -1): LocalDate {
  return anchor.add({ days: delta * (mode === "day" ? 1 : 7) });
}

/**
 * The width bands (DESIGN_SYSTEM.md §4a): the phone (Day only, three days on a phone held sideways), three columns
 * that scroll sideways in the narrow band, five weekdays with the weekend folded in the medium one, all seven from
 * 1180 px. Like Upcoming's planner, the band steps down when the grid itself has less room than the band assumes.
 */
export type CalendarBand = "phone" | "landscape" | "narrow" | "medium" | "wide";
/** The grid's own width at the narrowest viewport of each band, with the full sidebar and the view padding. */
const MIN_CONTENT = { medium: 560, wide: 860 } as const;

export function calendarBand(viewport: number, content: number, phoneLandscape = false): CalendarBand {
  if (phoneLandscape) return "landscape";
  if (viewport < 640) return "phone";
  const byViewport: CalendarBand = viewport >= 1180 ? "wide" : viewport >= 900 ? "medium" : "narrow";
  const byContent: CalendarBand = content >= MIN_CONTENT.wide ? "wide" : content >= MIN_CONTENT.medium ? "medium" : "narrow";
  const order: CalendarBand[] = ["narrow", "medium", "wide"];
  return order[Math.min(order.indexOf(byViewport), order.indexOf(byContent))];
}

/** What the band draws: the phone has the Day mode only, and a phone held sideways three days from the one in view. */
export type ShownMode = CalendarMode | "three";
export function shownMode(mode: CalendarMode, band: CalendarBand): ShownMode {
  if (band === "phone") return "day";
  if (band === "landscape") return "three";
  return mode;
}

/** The days a shown mode draws. */
export function shownDays(anchor: LocalDate, mode: ShownMode, weekStart: number): LocalDate[] {
  if (mode === "three") return [anchor, anchor.add({ days: 1 }), anchor.add({ days: 2 })];
  return visibleDays(anchor, mode, weekStart);
}

/** `[` / `]` for what is drawn: the sideways phone steps a day, like the Day mode. */
export function stepShown(anchor: LocalDate, mode: ShownMode, delta: 1 | -1): LocalDate {
  return stepAnchor(anchor, mode === "three" ? "day" : mode, delta);
}

/**
 * A column of the grid: one day, or a folded Saturday and Sunday (the medium band's week), drawn narrow with their
 * names until unfolded. Today is never folded: on a weekend its column stays open, with its now line, and `B`
 * still has it to place on.
 */
export type GridColumn = { kind: "day"; day: LocalDate } | { kind: "folded"; days: LocalDate[] };

export function gridColumns(days: readonly LocalDate[], band: CalendarBand, unfolded: boolean, today?: LocalDate): GridColumn[] {
  const fold = band === "medium" && !unfolded && days.length === 7;
  const out: GridColumn[] = [];
  for (const day of days) {
    if (fold && day.dayOfWeek >= 6 && !today?.equals(day)) {
      const last = out[out.length - 1];
      if (last?.kind === "folded") last.days.push(day);
      else out.push({ kind: "folded", days: [day] });
    } else out.push({ kind: "day", day });
  }
  return out;
}

/** Days in view at once before the rest scroll sideways: three in the narrow band (and on a sideways phone). */
export function columnsInView(band: CalendarBand, columns: number): number {
  return band === "narrow" || band === "landscape" ? Math.min(3, columns) : columns;
}

/**
 * The day `B` places on (DECISIONS.md "`B`"): the day in view, or in the week modes today when it is on screen,
 * else the first day on screen that has not passed. Null when every day shown has passed.
 */
export function focusDay(days: readonly LocalDate[], today: LocalDate): LocalDate | null {
  if (days.some((d) => d.equals(today))) return today;
  return days.find((d) => compareDates(d, today) > 0) ?? null;
}

/** "Thursday 8 October", "Mon 5 – Fri 9 October", "Mon 28 Sep – Sun 4 Oct": the header's title. */
export function rangeTitle(days: readonly LocalDate[], today: LocalDate): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (days.length === 1) return formatDay(first, { weekday: "long", month: "long", today });
  if (first.month === last.month && first.year === last.year) return `${weekdayName(first)} ${first.day} – ${formatDay(last, { month: "long", today })}`;
  return `${formatDay(first, { today })} – ${formatDay(last, { today })}`;
}
