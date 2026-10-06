// Named SQL only the week planner reads (Upcoming, SCREENS.md §3 and §6). A
// file of its own rather than views.ts, which the app shells import: string
// constants are not tree-shaken, and these are not on any shell's first paint.

/**
 * What each day of a range has planned, for its capacity: open tasks dated `?1`…`?2` that will be on their
 * day's list by then (started by their do-date), as Today counts its own day.
 */
export const DAY_LOAD_SQL = `
  select id, title, state, do_date, estimate_min, evening, day_sort_key from tasks
  where deleted_at is null and state in ('inbox', 'active')
    and do_date between ?1 and ?2
    and (start_date is null or start_date <= do_date)`;

/**
 * Upcoming's "Due" sub-groups (SCREENS.md §6): open tasks whose deadline falls on `?` or later and whose do-date
 * is another day, or none — a task due on the day it is planned for is already listed there.
 */
export const DUE_FROM_SQL = `
  select * from tasks
  where deleted_at is null and state in ('inbox', 'active', 'someday')
    and deadline >= ?
    and (do_date is null or do_date <> deadline)
  order by deadline, sort_key, id`;

/** The person's week start, 0 = Monday … 6 = Sunday, for the Calendar week. */
export const WEEK_START_SQL = `select week_start from user_settings limit 1`;
