// The Logbook's shape (SCREENS.md §8): finished and dropped tasks, newest
// first, grouped by the day they were finished or dropped on; each
// day's dropped tasks kept apart for their collapsed sub-group. Pure.
// The day is the person's own, which starts at the rollover hour: what is
// ticked at 01:00 is under the day that was ending (SYSTEM_DESIGN.md D11).
import { formatTime, instant, todayFor, type LocalDate } from "@/core/time";
import type { Task, TaskId } from "@/core/types";
import { normaliseTimestamp, toTask } from "@/data/mappers";
import type { TaskRow } from "@/data/schema.client";

/** A repeat's completion, joined to the task it belongs to (LOGBOOK_COMPLETIONS_SQL). */
export type CompletionRow = TaskRow & { completion_id: string; occurrence_completed_at: string; /** How long that day of it took, when it was said. */ occurrence_actual_min?: number | null };

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
  /** How long it took, when the person said (DECISIONS.md, amendment 2026-11-15): the row says so and the day counts it. */
  tookMin?: number;
}

export interface LogbookDay {
  day: LocalDate;
  done: LogbookEntry[];
  dropped: LogbookEntry[];
  /** What the day's done entries add up to: what each took where that is recorded, else its estimate (unestimated ones at the default). */
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
  /** The hour the person's day starts (user_settings.day_rollover_hour); 4 when left out. */
  rolloverHour?: number;
  defaultEstimateMin: number;
}): LogbookDay[] {
  const daySettings = { timezone: input.zone, dayRolloverHour: input.rolloverHour ?? 4 };
  const stamped: Stamped[] = [];
  const add = (when: string | null | undefined, kind: LogbookKind, key: string, task: Task, expired = false, took: number | null = null) => {
    if (!when) return;
    const at = instant(normaliseTimestamp(when));
    const zoned = at.toZonedDateTimeISO(input.zone);
    const entry: LogbookEntry = { key, task, kind, at: formatTime(zoned.toPlainTime()) };
    if (expired) entry.expired = true;
    if (took != null && took > 0) entry.tookMin = took;
    stamped.push({ ms: zoned.epochMilliseconds, day: todayFor(daySettings, at), entry });
  };
  for (const r of input.done ?? []) add(r.completed_at, "done", r.id, toTask(r), false, r.actual_min);
  // A repeat's length is its finished day's, never the rolling task's.
  for (const r of input.completions ?? []) add(r.occurrence_completed_at, "completion", r.completion_id, { ...toTask(r), id: r.id as TaskId, state: "done" }, false, r.occurrence_actual_min ?? null);
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
      group.minutes += entryMinutes(entry, input.defaultEstimateMin);
    }
  }
  return days;
}

/** What a done entry adds to its day: what it took where the person said, else what it was counted as. */
export function entryMinutes(entry: LogbookEntry, defaultEstimateMin: number): number {
  return entry.tookMin ?? entry.task.estimateMin ?? defaultEstimateMin;
}
