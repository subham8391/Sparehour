// The Logbook's shape (SCREENS.md §8): finished and dropped tasks, newest
// first, grouped by the local day they were finished or dropped on; each
// day's dropped tasks kept apart for their collapsed sub-group. Pure.
import { formatTime, instant, type LocalDate } from "@/core/time";
import type { Task, TaskId } from "@/core/types";
import { normaliseTimestamp, toTask } from "@/data/mappers";
import type { TaskRow } from "@/data/schema.client";

/** A repeat's completion, joined to the task it belongs to (LOGBOOK_COMPLETIONS_SQL). */
export type CompletionRow = TaskRow & { completion_id: string; occurrence_completed_at: string };

export type LogbookKind = "done" | "completion" | "dropped";

export interface LogbookEntry {
  /** The row's key: the task's id, or the completion's for one occurrence of a repeat. */
  key: string;
  /** The task the row shows and opens; for a completion, the repeating task itself. */
  task: Task;
  kind: LogbookKind;
  /** When it was finished or dropped, as the row's quiet time. */
  at: string;
  /** Dropped by the rollover because its miss policy is "expire" (PRODUCT_SPEC.md §8.2 rule 5). */
  expired?: boolean;
}

export interface LogbookDay {
  day: LocalDate;
  done: LogbookEntry[];
  dropped: LogbookEntry[];
  /** What the day's done entries add up to (unestimated ones at the default). */
  minutes: number;
}

interface Stamped {
  ms: number;
  day: LocalDate;
  entry: LogbookEntry;
}

export function logbookDays(input: {
  done: readonly TaskRow[] | undefined;
  completions: readonly CompletionRow[] | undefined;
  dropped: readonly TaskRow[] | undefined;
  zone: string;
  defaultEstimateMin: number;
}): LogbookDay[] {
  const stamped: Stamped[] = [];
  const add = (when: string | null | undefined, kind: LogbookKind, key: string, task: Task, expired = false) => {
    if (!when) return;
    const zoned = instant(normaliseTimestamp(when)).toZonedDateTimeISO(input.zone);
    const entry: LogbookEntry = { key, task, kind, at: formatTime(zoned.toPlainTime()) };
    if (expired) entry.expired = true;
    stamped.push({ ms: zoned.epochMilliseconds, day: zoned.toPlainDate(), entry });
  };
  for (const r of input.done ?? []) add(r.completed_at, "done", r.id, toTask(r));
  for (const r of input.completions ?? []) add(r.occurrence_completed_at, "completion", r.completion_id, { ...toTask(r), id: r.id as TaskId, state: "done" });
  // A drop is written as a state change, so the row's last write is when it was dropped.
  for (const r of input.dropped ?? []) add(r.updated_at ?? r.last_touched_at, "dropped", r.id, toTask(r), Boolean(r.expired_at));
  stamped.sort((a, b) => b.ms - a.ms || (a.entry.key < b.entry.key ? -1 : a.entry.key > b.entry.key ? 1 : 0));

  const days: LogbookDay[] = [];
  for (const { day, entry } of stamped) {
    let group = days[days.length - 1];
    if (!group || !group.day.equals(day)) {
      group = { day, done: [], dropped: [], minutes: 0 };
      days.push(group);
    }
    if (entry.kind === "dropped") {
      group.dropped.push(entry);
    } else {
      group.done.push(entry);
      group.minutes += entry.task.estimateMin ?? input.defaultEstimateMin;
    }
  }
  return days;
}
