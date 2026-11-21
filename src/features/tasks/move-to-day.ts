// Moving a task to a day, alone: the one write behind Move to… and the "Not yet planned" sheet's day cells, with
// none of the picker's screen parts (day-picker.tsx). Its own module so the Android app places a task exactly as the
// web does (docs/mobile/ANDROID_APP_SPEC.md §4).
import { keyBetween } from "@/core/ordering";
import type { LocalDate } from "@/core/time";
import type { LocalDatabase } from "@/data/powersync";
import type { TaskRepo } from "@/data/repositories/task-repo";

/** The open tasks already on a day and in the same part of it, for the place at its end. */
const LAST_IN_DAY_SQL = `select max(day_sort_key) as k from tasks where do_date = ? and evening = ? and id <> ? and state in ('active', 'inbox')`;

/**
 * Moves a task to `day`, at the end of that day's list and in the same part of it (a This evening task stays in the
 * evening, as a drag keeps it): one statement, one undo entry with its toast ("Moved “X” to Thu 8 Oct"). A task
 * already on that day is left where it is. Someday and Inbox tasks become active, as with any date.
 */
export async function moveToDay(db: Pick<LocalDatabase, "getOptional">, repo: Pick<TaskRepo, "placeInDay">, id: string, day: LocalDate): Promise<void> {
  const task = await db.getOptional<{ do_date: string | null; evening: number | null }>(`select do_date, evening from tasks where id = ?`, [id]);
  if (!task || task.do_date === day.toString()) return;
  const evening = Boolean(task.evening);
  const last = (await db.getOptional<{ k: string | null }>(LAST_IN_DAY_SQL, [day.toString(), evening ? 1 : 0, id]))?.k ?? null;
  await repo.placeInDay(id, day, keyBetween(last, null), evening);
}
