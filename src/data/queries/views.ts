// Named SQL for the list views. Each is the simplest true statement of what
// the view shows; the engines do the thinking on the rows.
import type { LocalDate } from "@/core/time";

/** Untriaged, newest first — the inbox is a queue. */
export const INBOX_SQL = `select * from tasks where deleted_at is null and state = 'inbox' order by created_at desc, id`;

/** Parked on purpose, most recently touched first. */
export const SOMEDAY_SQL = `select * from tasks where deleted_at is null and state = 'someday' order by last_touched_at desc, id`;

/**
 * Open tasks planned inside a day range (the rolling week), as of its first day: a task whose start date
 * has not come by then is hidden (PRODUCT_SPEC.md §7) and waits in "Starting later" (STARTING_LATER_SQL).
 * Two parameters, the range's first and last day; the first is also the day the start dates are read on.
 */
export const PLANNED_BETWEEN_SQL = `
  select * from tasks
  where deleted_at is null and state = 'active'
    and do_date between ?1 and ?2
    and (start_date is null or start_date <= ?1)
  order by do_date, day_sort_key, sort_key, id`;

/** Open tasks with no day yet that have started by `?` (today). */
export const UNPLANNED_SQL = `
  select * from tasks
  where deleted_at is null and state = 'active' and do_date is null
    and (start_date is null or start_date <= ?)
  order by sort_key, id`;

/**
 * Upcoming past its first seven days (SCREENS.md §6): open tasks dated after `?1` (the week's last day)
 * that have started by `?2` (today), in day order.
 */
export const PLANNED_AFTER_SQL = `
  select * from tasks
  where deleted_at is null and state = 'active'
    and do_date > ?1
    and (start_date is null or start_date <= ?2)
  order by do_date, day_sort_key, sort_key, id`;

/** Open tasks hidden by a start date after `?` (today), by the day they start: Upcoming's collapsed "Starting later" groups. */
export const STARTING_LATER_SQL = `
  select * from tasks
  where deleted_at is null and state = 'active' and start_date > ?
  order by start_date, do_date, sort_key, id`;

/**
 * Dropped tasks, most recently dropped first (PRODUCT_SPEC.md §7: they sit in the Logbook under "Dropped" and
 * stay recoverable). They are not done, so the working set already carries them; `updated_at` is when the drop
 * was written here, before the server's `last_touched_at` comes back.
 */
export const DROPPED_SQL = `
  select * from tasks
  where deleted_at is null and state = 'dropped'
  order by coalesce(updated_at, last_touched_at) desc, id
  limit 500`;

/** Completed tasks, newest first; the logbook stream delivers them by month. */
export const LOGBOOK_SQL = `
  select * from tasks
  where deleted_at is null and state = 'done' and completed_at is not null
  order by completed_at desc, id
  limit 1000`;

/**
 * Completions of repeating tasks (SYSTEM_DESIGN.md §5.2: one rolling row plus
 * a completion per occurrence), newest first, with the task they belong to.
 */
export const LOGBOOK_COMPLETIONS_SQL = `
  select t.*, c.id as completion_id, c.completed_at as occurrence_completed_at, c.occurrence_date
  from task_completions c join tasks t on t.id = c.task_id
  where c.deleted_at is null and t.deleted_at is null
  order by c.completed_at desc, c.id
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

/** An area's completed and archived projects, the most recently finished first: the area page's collapsed group. */
export const AREA_FINISHED_PROJECTS_SQL = `
  select id, name, area_id, state from projects
  where deleted_at is null and area_id = ? and state in ('done', 'archived')
  order by coalesce(completed_at, updated_at) desc, name, id`;

/** Calendar events starting inside a day range (the mirror keeps ISO UTC text, so the date prefix is comparable). */
export const EVENTS_BETWEEN_SQL = `
  select * from calendar_events
  where deleted_at is null and substr(start_at, 1, 10) between ? and ?
  order by start_at, id`;

export const CALENDARS_COUNT_SQL = `select count(*) as n from calendars where deleted_at is null`;

/** One task, for the detail panel. */
export const TASK_SQL = `select * from tasks where id = ? and deleted_at is null`;

/** One task's state, for a command that only applies in one (U un-completes a done task). */
export const TASK_STATE_SQL = `select state from tasks where id = ? and deleted_at is null`;

/** One project's name, for the quick-add token that files a task into it. */
export const PROJECT_NAME_SQL = `select name from projects where id = ? and deleted_at is null`;

/** Every open task in the space (inbox and active), for the morning plan's picker. */
export const OPEN_TASKS_SQL = `select * from tasks where deleted_at is null and state in ('inbox', 'active', 'someday') order by sort_key, id`;

/** The day's plan row (rituals, rating, highlight). */
export const DAY_PLAN_SQL = `select * from day_plans where deleted_at is null and date = ? limit 1`;

/** Tasks completed between two instants (ISO text bounds, inclusive/exclusive); present locally while the logbook stream is subscribed. */
export const DONE_BETWEEN_SQL = `
  select * from tasks
  where deleted_at is null and state = 'done' and completed_at >= ? and completed_at < ?
  order by completed_at desc, id`;

export const CHECKLIST_SQL = `select id, task_id, title, done, sort_key from checklist_items where deleted_at is null and task_id = ? order by sort_key, id`;

/** The tags on one task, by name. */
export const TASK_TAGS_SQL = `
  select t.id, t.name from task_tags tt
  join tags t on t.id = tt.tag_id and t.deleted_at is null
  where tt.deleted_at is null and tt.task_id = ?
  order by lower(t.name)`;

export const TAGS_SQL = `select id, name from tags where deleted_at is null order by lower(name)`;

export const PROJECT_HEADINGS_SQL = `select * from headings where deleted_at is null and project_id = ? order by sort_key, id`;

/** Open tasks whose title or notes contain the query (two `%q%` params), planned ones first. */
export const TASK_SEARCH_SQL = `
  select * from tasks
  where deleted_at is null and state in ('inbox', 'active', 'someday')
    and (title like ? escape '\\' or notes_md like ? escape '\\')
  order by case when do_date is null then 1 else 0 end, do_date, sort_key, id
  limit 12`;

/** Completed tasks in a project; only present locally while the logbook stream is subscribed. */
export const PROJECT_DONE_SQL = `
  select * from tasks
  where deleted_at is null and project_id = ? and state = 'done'
  order by completed_at desc, id
  limit 200`;

/** An area's active projects with what their open tasks add up to. `?` = default estimate, then the area id. */
export const AREA_PROJECT_STATS_SQL = `
  select p.id, p.name, p.deadline,
         count(t.id) as open_count,
         coalesce(sum(coalesce(t.estimate_min, ?)), 0) as open_min,
         min(t.deadline) as next_deadline
  from projects p
  left join tasks t on t.project_id = p.id and t.deleted_at is null and t.state in ('inbox', 'active')
  where p.deleted_at is null and p.area_id = ? and p.state = 'active'
  group by p.id
  order by p.sort_key, p.name`;

export interface AreaProjectStatsRow {
  id: string;
  name: string | null;
  deadline: string | null;
  open_count: number;
  open_min: number;
  next_deadline: string | null;
}

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
