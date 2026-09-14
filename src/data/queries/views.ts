// Named SQL for the list views. Each is the simplest true statement of what
// the view shows; the engines do the thinking on the rows.
import type { LocalDate } from "@/core/time";

/** Untriaged, newest first — the inbox is a queue. */
export const INBOX_SQL = `select * from tasks where deleted_at is null and state = 'inbox' order by created_at desc, id`;

/** Parked on purpose, most recently touched first. */
export const SOMEDAY_SQL = `select * from tasks where deleted_at is null and state = 'someday' order by last_touched_at desc, id`;

/** Open tasks planned inside a day range (the rolling week). */
export const PLANNED_BETWEEN_SQL = `
  select * from tasks
  where deleted_at is null and state = 'active'
    and do_date between ? and ?
  order by do_date, day_sort_key, sort_key, id`;

/** Open tasks with no day yet. */
export const UNPLANNED_SQL = `select * from tasks where deleted_at is null and state = 'active' and do_date is null order by sort_key, id`;

/** Completed tasks, newest first; the logbook stream delivers them by month. */
export const LOGBOOK_SQL = `
  select * from tasks
  where deleted_at is null and state = 'done' and completed_at is not null
  order by completed_at desc, id
  limit 1000`;

/** Everything still open in one project, in the project's own order. */
export const PROJECT_TASKS_SQL = `
  select * from tasks
  where deleted_at is null and project_id = ? and state in ('inbox', 'active', 'someday')
  order by sort_key, id`;

export const PROJECT_SQL = `select * from projects where id = ? and deleted_at is null`;
export const AREA_SQL = `select * from areas where id = ? and deleted_at is null`;
export const AREA_PROJECTS_SQL = `
  select id, name, area_id from projects
  where deleted_at is null and area_id = ? and (state is null or state not in ('done', 'archived', 'dropped'))
  order by sort_key, name`;

/** Calendar events starting inside a day range (the mirror keeps ISO UTC text, so the date prefix is comparable). */
export const EVENTS_BETWEEN_SQL = `
  select * from calendar_events
  where deleted_at is null and substr(start_at, 1, 10) between ? and ?
  order by start_at, id`;

export const CALENDARS_COUNT_SQL = `select count(*) as n from calendars where deleted_at is null`;

/** One task, for the detail panel. */
export const TASK_SQL = `select * from tasks where id = ? and deleted_at is null`;

/** Inclusive ISO date bounds for `day` and the `days - 1` days after it. */
export function dayRangeParams(day: LocalDate, days: number): [string, string] {
  return [day.toString(), day.add({ days: Math.max(0, days - 1) }).toString()];
}

/** The calendar months covering `day` and the `n - 1` months before it — the logbook's stream keys. */
export function monthsBack(day: LocalDate, n: number): string[] {
  const month = day.toPlainYearMonth();
  return Array.from({ length: Math.max(1, n) }, (_, i) => month.subtract({ months: i }).toString());
}
