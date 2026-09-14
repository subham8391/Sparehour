// Carry-over / rollover engine. See docs/engineering/SYSTEM_DESIGN.md §5.3.
//
// "Carried over" is a VIEW first (`carriedOver`), so the UI is right the moment
// the app opens even if the job never ran. The job (`rollover`) only maintains
// what a view cannot compute: carry_count, auto-Someday aging and the
// skip/expire miss policies. This module is the pure decision logic; the SQL
// job in the database mirrors it exactly. The view lives in ./carried so the
// shell can import it without the job (and its recurrence engine).
import { compareDates, todayFor, type DaySettings, type Instant, type LocalDate } from "../time";
import { nextOccurrence } from "../recurrence";
import type { RecurrenceException, Task } from "../types";
import type { RolloverSettings } from "./carried";

export { carriedOver, shouldAsk, type RolloverSettings } from "./carried";

export type RolloverOutcome = "carried" | "skipped" | "expired" | "someday" | "routine_dropped" | "untouched";

export interface RolloverResult {
  tasks: Task[];
  outcomes: Map<string, RolloverOutcome>;
  stats: Record<RolloverOutcome, number>;
}

export interface RolloverInput {
  tasks: readonly Task[];
  settings: RolloverSettings;
  now: Instant;
  /** "Just this once" exceptions, keyed by recurrence series id. */
  exceptions?: ReadonlyMap<string, readonly RecurrenceException[]>;
}

const isOpen = (t: Task) => t.state === "inbox" || t.state === "active";

/**
 * One day's rollover for one user. Idempotent for a given local date: a
 * second run on the same day changes nothing (the `lastCarriedAt < today`
 * guard), and it never touches deadlines, blocks or notifications.
 */
export function rollover(input: RolloverInput): RolloverResult {
  const { settings, now, exceptions = new Map<string, readonly RecurrenceException[]>() } = input;
  const today = todayFor(settings, now);
  const outcomes = new Map<string, RolloverOutcome>();
  const stats: Record<RolloverOutcome, number> = { carried: 0, skipped: 0, expired: 0, someday: 0, routine_dropped: 0, untouched: 0 };

  const tasks = input.tasks.map((t) => {
    let out: Task = t;
    let outcome: RolloverOutcome = "untouched";

    if (isOpen(t) && t.doDate && compareDates(t.doDate, today) < 0) {
      if (t.routineRunId !== null) {
        // 5. a missed routine occurrence is skipped — dropped, never carried
        out = { ...t, state: "dropped" };
        outcome = "routine_dropped";
      } else if (t.missPolicy === "expire") {
        // 1. the occurrence is simply gone
        out = { ...t, state: "dropped" };
        outcome = "expired";
      } else if (t.missPolicy === "skip" && t.recurrenceRule && t.recurrenceMode) {
        // 2. jump to the next occurrence, no guilt counter
        const next = nextOccurrence({
          rule: t.recurrenceRule,
          mode: t.recurrenceMode,
          doDate: t.doDate,
          completedOn: today.subtract({ days: 1 }),
          pausedUntil: t.recurrencePausedUntil,
          exceptions: exceptions.get(t.recurrenceSeriesId ?? t.id) ?? [],
        });
        out = next ? { ...t, doDate: next } : { ...t, state: "dropped" };
        outcome = "skipped";
      } else if (t.lastCarriedAt === null || compareDates(t.lastCarriedAt, today) < 0) {
        // 3. bump the counter once per day, at most
        out = { ...t, carryCount: t.carryCount + 1, lastCarriedAt: today };
        outcome = "carried";
      }
    }

    // 4. auto-Someday: untouched for autoSomedayDays, regardless of carry count
    if (isOpen(out) && outcome !== "expired" && outcome !== "routine_dropped") {
      const idleDays = today.since(todayFor(settings, out.lastTouchedAt)).days;
      if (idleDays >= settings.autoSomedayDays) {
        out = { ...out, state: "someday", doDate: null, carryCount: 0 };
        outcome = "someday";
      }
    }

    outcomes.set(t.id, outcome);
    stats[outcome]++;
    return out;
  });

  return { tasks, outcomes, stats };
}

/** Archives — never deletes — everything still carrying, as one undoable batch. */
export function clearTheSlate(tasks: readonly Task[], today: LocalDate): { tasks: Task[]; archivedIds: string[] } {
  const archivedIds: string[] = [];
  const out = tasks.map((t) => {
    if (isOpen(t) && t.doDate && compareDates(t.doDate, today) < 0 && t.routineRunId === null) {
      archivedIds.push(t.id);
      return { ...t, state: "archived" as const, doDate: null, carryCount: 0 };
    }
    return t;
  });
  return { tasks: out, archivedIds };
}

/**
 * Scheduling guard for the job: one run per (user, local date). Handles DST
 * (a repeated local hour is the same date), and travel (a skipped date simply
 * never gets a run; a repeated one is absorbed).
 */
export function nextRunDate(ledger: ReadonlySet<string>, settings: DaySettings, now: Instant): LocalDate | null {
  const today = todayFor(settings, now);
  return ledger.has(today.toString()) ? null : today;
}
