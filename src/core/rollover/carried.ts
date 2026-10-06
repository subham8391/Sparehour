// The carried-over VIEW (SYSTEM_DESIGN.md §5.3), on its own so the Today
// shell can show it without loading the rollover job — and the recurrence
// engine the job needs (§11.6).
import { compareDates, type DaySettings, type Instant, type LocalDate } from "../time";
import type { Task, TaskId } from "../types";

const byCodeUnit = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

export interface RolloverSettings extends DaySettings {
  /** Show "Still want this?" once a task has been carried this many times. */
  carryAskAfter: number;
  /** Untouched for this many days → Someday. */
  autoSomedayDays: number;
}

/**
 * The Carried-over section: due before today, still open, visible, and not a routine occurrence. Most carried
 * first, then the oldest do-date (the rollover never rewrites it, so it is the day first missed), then the hand
 * order (SCREENS.md §2.3).
 */
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
    // Fractional keys and ids compare by code unit (as core/ordering does), never by locale.
    .sort(
      (a, b) =>
        b.carryCount - a.carryCount ||
        compareDates(a.doDate as LocalDate, b.doDate as LocalDate) ||
        byCodeUnit(a.daySortKey ?? "", b.daySortKey ?? "") ||
        byCodeUnit(a.id, b.id),
    );
}

/** Not a stored flag: evaluated live, so changing the setting applies instantly. */
export const shouldAsk = (task: Task, settings: Pick<RolloverSettings, "carryAskAfter">): boolean =>
  task.carryCount >= settings.carryAskAfter;

/** PRODUCT_SPEC.md §8.3.4: at most two asks a day across all tasks… */
export const ASKS_PER_DAY = 2;
/** …and at most one per task in seven days. */
export const ASK_MEMORY_DAYS = 7;

export interface AskRecord {
  /** Tasks whose ask was shown today (any state: one answered with Someday still counts). */
  askedToday: ReadonlySet<TaskId | string>;
  /** When each task's ask was last shown, for the seven-day memory. */
  askedAt: (task: Task) => Instant | null;
  now: Instant;
}

/**
 * Which carried tasks show the three-carry ask (SCREENS.md §2.3 "Max two asks visible per day; the rest wait"),
 * one rule for Today, the morning plan and the review. A task asked earlier today keeps its ask until it is
 * answered; the day's remaining asks go to the first tasks at the threshold, in carried order, that have not been
 * asked in the last seven days. Evaluated live, so a new threshold in Settings applies at once.
 */
export function pickAsks(carried: readonly Task[], settings: Pick<RolloverSettings, "carryAskAfter">, record: AskRecord): Set<TaskId> {
  const shown = new Set<TaskId>();
  for (const t of carried) if (shouldAsk(t, settings) && record.askedToday.has(t.id)) shown.add(t.id);
  let used = Math.max(record.askedToday.size, shown.size);
  const memoryMs = ASK_MEMORY_DAYS * 24 * 60 * 60 * 1000;
  for (const t of carried) {
    if (used >= ASKS_PER_DAY) break;
    if (shown.has(t.id) || !shouldAsk(t, settings)) continue;
    const at = record.askedAt(t);
    if (at && record.now.epochMilliseconds - at.epochMilliseconds < memoryMs) continue;
    shown.add(t.id);
    used++;
  }
  return shown;
}
