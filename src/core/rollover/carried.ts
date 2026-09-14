// The carried-over VIEW (SYSTEM_DESIGN.md §5.3), on its own so the Today
// shell can show it without loading the rollover job — and the recurrence
// engine the job needs (§11.6).
import { compareDates, type DaySettings, type LocalDate } from "../time";
import type { Task } from "../types";

export interface RolloverSettings extends DaySettings {
  /** Show "Still want this?" once a task has been carried this many times. */
  carryAskAfter: number;
  /** Untouched for this many days → Someday. */
  autoSomedayDays: number;
}

/** The Carried-over section: due before today, still open, visible, and not a routine occurrence. */
export function carriedOver(tasks: readonly Task[], today: LocalDate): Task[] {
  return tasks
    .filter(
      (t) =>
        (t.state === "inbox" || t.state === "active") &&
        t.doDate !== null &&
        compareDates(t.doDate, today) < 0 &&
        (t.startDate === null || compareDates(t.startDate, today) <= 0) &&
        t.routineRunId === null,
    )
    .sort((a, b) => b.carryCount - a.carryCount || (a.daySortKey ?? "").localeCompare(b.daySortKey ?? "") || a.id.localeCompare(b.id));
}

/** Not a stored flag: evaluated live, so changing the setting applies instantly. */
export const shouldAsk = (task: Task, settings: Pick<RolloverSettings, "carryAskAfter">): boolean =>
  task.carryCount >= settings.carryAskAfter;
