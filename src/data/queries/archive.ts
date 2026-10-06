// The local queries behind Clear the slate and Settings › Data › Archive
// (PRODUCT_SPEC.md §8.5, SCREENS.md §18). The slate's scope is the SQL twin
// of `inSlate` in core/rollover: "Today only" is every active task dated
// today or earlier; "Today + backlog" adds the undated ones with nothing
// ahead of them. The Inbox, repeating tasks and routine runs are never in it.
import type { SlateScope } from "@/core/rollover";

const OPEN = `deleted_at is null and state = 'active' and routine_run_id is null and coalesce(recurrence_rule, '') = ''`;
const DATED = `do_date is not null and do_date <= ?`;
const BACKLOG = `do_date is null and (start_date is null or start_date <= ?) and (deadline is null or deadline <= ?)`;

/** The tasks a Clear the slate in this scope takes, and the arguments for its `?`s (today, as YYYY-MM-DD). */
export function slateWhere(scope: SlateScope, today: string): { where: string; args: string[] } {
  if (scope === "today") return { where: `${OPEN} and ${DATED}`, args: [today] };
  return { where: `${OPEN} and ((${DATED}) or (${BACKLOG}))`, args: [today, today, today] };
}

/** How many tasks each scope would take: `today` for Today only, `backlog` for what Today + backlog adds. */
export const SLATE_COUNTS_SQL = `select
    coalesce(sum(case when ${DATED} then 1 else 0 end), 0) as today,
    coalesce(sum(case when ${BACKLOG} then 1 else 0 end), 0) as backlog
  from tasks where ${OPEN}`;
export const slateCountArgs = (today: string): string[] => [today, today, today];

/** Every archived task, newest batch first; the batch is null for tasks archived before batches existed. */
export const ARCHIVED_SQL = `select id, title, archive_batch_id, archived_from_state, coalesce(archived_at, updated_at) as archived_at, do_date
  from tasks where deleted_at is null and state = 'archived'
  order by coalesce(archived_at, updated_at) desc, sort_key, id`;

/** Every dropped task, for Delete permanently. */
export const DROPPED_SQL = `select id from tasks where deleted_at is null and state = 'dropped'`;

export interface ArchivedRow {
  id: string;
  title: string | null;
  archive_batch_id: string | null;
  archived_from_state: string | null;
  archived_at: string | null;
  do_date: string | null;
}
