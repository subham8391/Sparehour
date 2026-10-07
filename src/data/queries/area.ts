// Named SQL behind the area view (SCREENS.md §9): its project cards with their
// figures and progress, and the tasks filed in the area directly.
import { TAG_NAMES } from "./shell";

/**
 * The area's active projects as cards: the open count, the summed estimate (`?1` stands in for a task without
 * one), the nearest deadline, and what was finished since `?3` (a week ago) — done tasks plus completed
 * occurrences of repeating ones. The progress bar is `done_week / (done_week + open_count)` (DECISIONS.md, M1 gap
 * rulings): done tasks are purged after a week, so a bar over a project's whole life would lie.
 */
export const AREA_PROJECT_CARDS_SQL = `
  select p.id, p.name, p.deadline,
         (select count(*) from tasks t where t.project_id = p.id and t.deleted_at is null and t.state in ('inbox', 'active')) as open_count,
         (select coalesce(sum(coalesce(t.estimate_min, ?1)), 0) from tasks t where t.project_id = p.id and t.deleted_at is null and t.state in ('inbox', 'active')) as open_min,
         (select min(t.deadline) from tasks t where t.project_id = p.id and t.deleted_at is null and t.state in ('inbox', 'active')) as next_deadline,
         (select count(*) from tasks t where t.project_id = p.id and t.deleted_at is null and t.state = 'done' and t.completed_at >= ?3)
           + (select count(*) from task_completions c join tasks t on t.id = c.task_id
              where t.project_id = p.id and t.deleted_at is null and c.deleted_at is null and c.completed_at >= ?3) as done_week
  from projects p
  where p.deleted_at is null and p.area_id = ?2 and p.state = 'active'
  order by p.sort_key, p.name`;

export interface AreaProjectCardRow {
  id: string;
  name: string | null;
  deadline: string | null;
  open_count: number;
  open_min: number;
  next_deadline: string | null;
  done_week: number;
}

/** The area's loose tasks — filed in it directly, with no project — that are still open, in their list order. */
export const AREA_TASKS_SQL = `
  select *, ${TAG_NAMES} from tasks
  where deleted_at is null and area_id = ? and project_id is null and state in ('inbox', 'active')
  order by sort_key, id`;

/** The progress bar's share, 0–1: finished this week against those plus the open ones. */
export function weekProgress(doneWeek: number, open: number): number {
  const total = doneWeek + open;
  return total > 0 ? doneWeek / total : 0;
}

/** The words beside the bar: "3 done this week · 9 open"; the first half only when something was finished. */
export function progressLabel(doneWeek: number, open: number): string {
  return doneWeek > 0 ? `${doneWeek} done this week · ${open} open` : `${open} open`;
}
