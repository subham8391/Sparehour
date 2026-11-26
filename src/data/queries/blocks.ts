// Named SQL for time blocks read away from Today's timeline: a task's own blocks, for its detail, and the coming
// days' blocks, for what Settings › Notifications says quiet hours hold back (docs/product/REMINDERS_AND_AI_SPEC.md
// §1). A file of its own, so neither rides in a shell's first download, and free of the web's screen parts, so the
// Android app reads the same rows.
import type { Instant } from "@/core/time";

/** A task's blocks that end on a date or later, in start order; params [task id, date]. */
export const TASK_BLOCKS_SQL = `
  select * from time_blocks
  where task_id = ? and deleted_at is null and substr(end_at, 1, 10) >= ?
  order by start_at`;

/**
 * The blocks a reminder is made for, starting between two dates (the UTC dates their `start_at` opens with): a block
 * with no task, or one whose task is still to be done. The sender's own choice (the block claim in
 * supabase/migrations), with the title it would give the reminder; params [from, to].
 */
export const COMING_BLOCKS_SQL = `
  select b.id, b.start_at, b.title as block_title, t.title as task_title
  from time_blocks b
  left join tasks t on t.id = b.task_id and t.deleted_at is null
  where b.deleted_at is null
    and substr(b.start_at, 1, 10) between ?1 and ?2
    and (b.task_id is null or (t.id is not null and t.state in ('inbox', 'active')))
  order by b.start_at, b.id`;

export interface ComingBlockRow {
  id: string;
  start_at: string | null;
  /** The block's own title, which names it when it has no task. */
  block_title: string | null;
  task_title: string | null;
}

/**
 * COMING_BLOCKS_SQL's dates for the `days` after `now`, a day wider at each end: the statement reads dates, so the
 * reader keeps the exact stretch (features/notifications/held-reminders.ts).
 */
export function comingBlocksParams(now: Instant, days: number): [string, string] {
  const day = now.toZonedDateTimeISO("UTC").toPlainDate();
  return [day.subtract({ days: 1 }).toString(), day.add({ days: days + 1 }).toString()];
}
