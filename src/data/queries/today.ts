// Named SQL for the Today screen. Date filters use the ISO date prefix of the
// stored timestamp so they are robust to " " vs "T" formats; the capacity
// engine clips to the day precisely.
import type { LocalDate } from "@/core/time";

export const SETTINGS_SQL = `select * from user_settings limit 1`;
export const WORK_HOURS_SQL = `select * from work_hours where deleted_at is null`;

/** Open tasks planned on or before `today` and already started: Today + Carried over in one query. */
export const TASKS_THROUGH_TODAY_SQL = `
  select * from tasks
  where deleted_at is null
    and state in ('inbox','active')
    and do_date is not null and do_date <= ?
    and (start_date is null or start_date <= ?)
  order by day_sort_key, sort_key, id`;

/** When each open task through today was made, for Plan my day's age term (SYSTEM_DESIGN.md §5.5). */
export const TASK_AGES_THROUGH_TODAY_SQL = `
  select id, created_at from tasks
  where deleted_at is null
    and state in ('inbox','active')
    and do_date is not null and do_date <= ?`;

export const BLOCKS_AROUND_SQL = `
  select * from time_blocks
  where deleted_at is null
    and substr(start_at, 1, 10) between ? and ?`;

export const EVENTS_AROUND_SQL = `
  select * from calendar_events
  where deleted_at is null
    and substr(start_at, 1, 10) between ? and ?`;

export const CALENDARS_SQL = `select id, read from calendars where deleted_at is null`;

/** Parameters covering the day plus a day either side (zone offsets never exceed a day). */
export function dayWindowParams(day: LocalDate): [string, string] {
  return [day.subtract({ days: 1 }).toString(), day.add({ days: 1 }).toString()];
}

/**
 * The calendar mirror syncs one bucket per month (`calendar_window` stream,
 * §3.5): Today asks for the month around `day` plus one either side, so a
 * week view near a month edge and zone offsets are covered.
 */
export function monthsAround(day: LocalDate): string[] {
  const month = day.toPlainYearMonth();
  return [month.subtract({ months: 1 }), month, month.add({ months: 1 })].map((m) => m.toString());
}
