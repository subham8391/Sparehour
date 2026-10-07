// The named SQL the shells read: the keyboard layer, the morning review, Today's day plan and done list,
// tomorrow's spare time and the logbook stream Settings' export subscribes to. Kept apart from views.ts, which
// re-exports them, so a first download carries these few rather than every list's query (SYSTEM_DESIGN.md §11.6).
import type { LocalDate } from "@/core/time";

// A task list's rows carry their tags' names (SCREENS.md §2.4 row anatomy: "· tags ·"), read in the list's own
// statement rather than one query per row: a correlated subquery on the task_tags index, its names joined by the
// unit separator (a name may hold a space). The mapper splits them (toTask → Task.tags). Tables the subquery reads
// are watched with the list's, so tagging a task redraws its row.
export const TAG_NAMES = `(select group_concat(g.name,char(31))from task_tags x join tags g on g.id=x.tag_id and g.deleted_at is null where x.task_id=tasks.id and x.deleted_at is null)tag_names`;

/**
 * Open tasks planned inside a day range (the rolling week), as of its first day: a task whose start date
 * has not come by then is hidden (PRODUCT_SPEC.md §7) and waits in "Starting later" (STARTING_LATER_SQL).
 * Two parameters, the range's first and last day; the first is also the day the start dates are read on.
 */
export const PLANNED_BETWEEN_SQL = `
  select *, ${TAG_NAMES} from tasks
  where deleted_at is null and state = 'active'
    and do_date between ?1 and ?2
    and (start_date is null or start_date <= ?1)
  order by do_date, day_sort_key, sort_key, id`;

/** One task's state, for a command that only applies in one (U un-completes a done task). */
export const TASK_STATE_SQL = `select state from tasks where id = ? and deleted_at is null`;

/** One project's name, for the quick-add token that files a task into it. */
export const PROJECT_NAME_SQL = `select name from projects where id = ? and deleted_at is null`;

/** The day's plan row (rituals, rating, highlight). */
export const DAY_PLAN_SQL = `select * from day_plans where deleted_at is null and date = ? limit 1`;

/** Tasks completed between two instants (ISO text bounds, inclusive/exclusive); present locally while the logbook stream is subscribed. */
export const DONE_BETWEEN_SQL = `
  select * from tasks
  where deleted_at is null and state = 'done' and completed_at >= ? and completed_at < ?
  order by completed_at desc, id`;

/** Inclusive ISO date bounds for `day` and the `days - 1` days after it. */
export function dayRangeParams(day: LocalDate, days: number): [string, string] {
  return [day.toString(), day.add({ days: Math.max(0, days - 1) }).toString()];
}

/** The calendar months covering `day` and the `n - 1` months before it — the logbook's stream keys. */
export function monthsBack(day: LocalDate, n: number): string[] {
  const month = day.toPlainYearMonth();
  return Array.from({ length: Math.max(1, n) }, (_, i) => month.subtract({ months: i }).toString());
}

/**
 * How many months of the logbook stream hold every finished task there is: the server removes a done task a
 * week after it was completed (DECISIONS.md 2026-09-28), so this month and the last cover all of them. The
 * Logbook, search and the export ask for the same months, so they share one subscription.
 */
export const LOGBOOK_MONTHS = 2;

/** The logbook stream's subscription for "every finished task", as of `today`. */
export function logbookStream(today: LocalDate): { name: "logbook"; parameters: { months: string[] } } {
  return { name: "logbook", parameters: { months: monthsBack(today, LOGBOOK_MONTHS) } };
}
