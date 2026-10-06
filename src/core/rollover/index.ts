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
import { deadlineForOccurrence } from "../recurrence/deadline";
import type { RecurrenceException, Task } from "../types";
import type { RolloverSettings } from "./carried";

export { carriedOver, shouldAsk, type RolloverSettings } from "./carried";

export type RolloverOutcome = "carried" | "skipped" | "unscheduled" | "expired" | "someday" | "routine_dropped" | "untouched";

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
  /** Tasks holding a time block in the next 7 days: exempt from auto-Someday. */
  blockedTaskIds?: ReadonlySet<string>;
}

const isOpen = (t: Task) => t.state === "inbox" || t.state === "active";
/** A repeat paused until today or later is not rolled: it waits on its pause date. */
const pausedOn = (t: Task, today: LocalDate) => t.recurrenceRule !== null && t.recurrencePausedUntil !== null && compareDates(t.recurrencePausedUntil, today) >= 0;

/**
 * Auto-Someday's exemptions (PRODUCT_SPEC.md §8.4 rule 3, A8 as ruled 2026-10-06): a deadline today or later,
 * any repeat rule (paused or not), a time block in the next 7 days, priority 1 (stored as 3), and a do-date
 * today or later, so a plan still ahead is never erased.
 */
export function exemptFromAutoFile(t: Task, today: LocalDate, blocked: ReadonlySet<string> = new Set()): boolean {
  return (
    (t.deadline !== null && compareDates(t.deadline, today) >= 0) ||
    t.recurrenceRule !== null ||
    t.priority === 3 ||
    (t.doDate !== null && compareDates(t.doDate, today) >= 0) ||
    blocked.has(t.id)
  );
}

/**
 * One day's rollover for one user. Idempotent for a given local date: a
 * second run on the same day changes nothing (the `lastCarriedAt < today`
 * guard). It never touches blocks or notifications, and a deadline moves
 * only with a skipped repeat's occurrence (at the same offset).
 */
export function rollover(input: RolloverInput): RolloverResult {
  const { settings, now, exceptions = new Map<string, readonly RecurrenceException[]>() } = input;
  const today = todayFor(settings, now);
  const outcomes = new Map<string, RolloverOutcome>();
  const stats: Record<RolloverOutcome, number> = { carried: 0, skipped: 0, unscheduled: 0, expired: 0, someday: 0, routine_dropped: 0, untouched: 0 };
  const blocked = input.blockedTaskIds ?? new Set<string>();

  const tasks = input.tasks.map((t) => {
    let out: Task = t;
    let outcome: RolloverOutcome = "untouched";

    if (isOpen(t) && t.doDate && compareDates(t.doDate, today) < 0) {
      if (t.routineRunId !== null) {
        // 5. a missed routine occurrence is skipped — dropped, never carried
        out = { ...t, state: "dropped" };
        outcome = "routine_dropped";
      } else if (t.missPolicy === "expire" && !pausedOn(t, today)) {
        // 1. dropped with the reason "expired" (the job stamps expired_at)
        out = { ...t, state: "dropped" };
        outcome = "expired";
      } else if ((t.missPolicy === "skip" || pausedOn(t, today)) && t.recurrenceRule && t.recurrenceMode) {
        // 2. jump to the next occurrence (or wait on the pause date), no guilt counter; the deadline goes along
        const next = nextOccurrence({
          rule: t.recurrenceRule,
          mode: t.recurrenceMode,
          doDate: t.doDate,
          completedOn: today.subtract({ days: 1 }),
          pausedUntil: t.recurrencePausedUntil,
          exceptions: exceptions.get(t.recurrenceSeriesId ?? t.id) ?? [],
        });
        out = next ? { ...t, doDate: next, deadline: deadlineForOccurrence(t.deadline, t.doDate, next) } : { ...t, state: "dropped" };
        outcome = "skipped";
      } else if (t.missPolicy === "skip" && !t.recurrenceRule) {
        // 2b. a one-off skip loses its missed date and keeps its carry count (PRODUCT_SPEC.md §8.2 rule 4)
        out = { ...t, doDate: null, doTime: null };
        outcome = "unscheduled";
      } else if (t.missPolicy === "carry" && !pausedOn(t, today) && (t.lastCarriedAt === null || compareDates(t.lastCarriedAt, today) < 0)) {
        // 3. bump the counter once per day, at most
        out = { ...t, carryCount: t.carryCount + 1, lastCarriedAt: today };
        outcome = "carried";
      }
    }

    // 4. auto-Someday: an active task untouched for autoSomedayDays, regardless of carry count, unless exempt
    if (out.state === "active" && outcome !== "expired" && outcome !== "routine_dropped" && out.routineRunId === null && !exemptFromAutoFile(out, today, blocked)) {
      const idleDays = today.since(todayFor(settings, out.lastTouchedAt)).days;
      if (idleDays >= settings.autoSomedayDays) {
        out = { ...out, state: "someday", doDate: null, doTime: null, carryCount: 0 };
        outcome = "someday";
      }
    }

    outcomes.set(t.id, outcome);
    stats[outcome]++;
    return out;
  });

  return { tasks, outcomes, stats };
}

/**
 * Clear the slate's two scopes (PRODUCT_SPEC.md §8.5 rule 2, ruled 2026-10-06): "Today only" is every open task
 * dated today or earlier, Carried over included; "Today + backlog" adds the active tasks with no date at all and
 * nothing ahead of them (no future start or deadline). The Inbox stays as it is, and so do repeating tasks (archiving
 * one would stop its series) and routine runs (they are skipped, never carried).
 */
export type SlateScope = "today" | "backlog";

export function inSlate(t: Task, today: LocalDate, scope: SlateScope): boolean {
  if (t.state !== "active" || t.routineRunId !== null || t.recurrenceRule) return false;
  if (t.doDate) return compareDates(t.doDate, today) <= 0;
  if (scope !== "backlog") return false;
  const ahead = (d: LocalDate | null) => d !== null && compareDates(d, today) > 0;
  return !ahead(t.startDate) && !ahead(t.deadline);
}

/**
 * Archives — never deletes — every task in the scope, as one batch with one undo. The do-date stays on each task
 * (PRODUCT_SPEC.md §6 "keeps everything"), so a restore puts it back on its day, or in Carried over once that day
 * has passed; the carry count starts again from zero.
 */
export function clearTheSlate(tasks: readonly Task[], today: LocalDate, scope: SlateScope = "today"): { tasks: Task[]; archivedIds: string[] } {
  const archivedIds: string[] = [];
  const out = tasks.map((t) => {
    if (!inSlate(t, today, scope)) return t;
    archivedIds.push(t.id);
    return { ...t, state: "archived" as const, carryCount: 0 };
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
