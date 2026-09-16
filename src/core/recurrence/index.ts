// Recurrence engine. See docs/engineering/SYSTEM_DESIGN.md §5.2.
//
// A recurring task is ONE row whose do_date rolls forward. `rrule` is used
// only as calendar algebra on UTC-midnight sentinel Dates; it never sees a
// timezone. Every date in and out of this module is a LocalDate.
import { RRule } from "rrule";
import { Temporal, compareDates, type LocalDate } from "../time";
import type { RecurrenceException, RecurrenceMode } from "../types";

const utcMidnight = (d: LocalDate): Date => new Date(Date.UTC(d.year, d.month - 1, d.day));
const fromUtcMidnight = (d: Date): LocalDate =>
  Temporal.PlainDate.from({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });

const FAR_FUTURE_DAYS = 366 * 20;

function build(rule: string, dtstart: LocalDate): RRule {
  const opts = RRule.parseString(rule);
  if (opts.tzid || opts.dtstart) throw new Error("recurrence rules carry no DTSTART or TZID; the anchor is passed separately");
  // The engine deals in calendar dates: FREQ is required and no finer than daily,
  // and an interval below one would never fire (or, negative, never finish).
  if (opts.freq === undefined || opts.freq > RRule.DAILY) throw new Error("recurrence needs FREQ of DAILY, WEEKLY, MONTHLY or YEARLY");
  if (opts.interval !== undefined && (!Number.isInteger(opts.interval) || opts.interval < 1)) throw new Error("recurrence INTERVAL must be a whole number of at least 1");
  return new RRule({ ...opts, dtstart: utcMidnight(dtstart) });
}

/** Does `rule` (anchored at `dtstart`) parse? Cheap validation for the repository layer. */
export function isValidRule(rule: string): boolean {
  try {
    build(rule, Temporal.PlainDate.from("2026-01-01"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Occurrences strictly after `after`, at most `limit` of them. `dtstart` is
 * the anchor the rule counts from (the series start for a fixed schedule,
 * the completion date for an after-completion one).
 */
export function occurrencesAfter(rule: string, dtstart: LocalDate, after: LocalDate, limit: number): LocalDate[] {
  if (limit <= 0) return [];
  const r = build(rule, dtstart);
  const from = utcMidnight(after.add({ days: 1 }));
  const to = utcMidnight(after.add({ days: FAR_FUTURE_DAYS }));
  return r.between(from, to, true, (_d, i) => i < limit).map(fromUtcMidnight);
}

/** Occurrences with `from <= d <= to`, for showing a series ahead of time. */
export function occurrencesBetween(rule: string, dtstart: LocalDate, from: LocalDate, to: LocalDate): LocalDate[] {
  if (compareDates(from, to) > 0) return [];
  const r = build(rule, dtstart);
  return r.between(utcMidnight(from), utcMidnight(to), true).map(fromUtcMidnight);
}

/** True when `date` is an occurrence of `rule` anchored at `dtstart`. */
export function isOccurrence(rule: string, dtstart: LocalDate, date: LocalDate): boolean {
  if (compareDates(date, dtstart) < 0) return false;
  return occurrencesBetween(rule, dtstart, date, date).length === 1;
}

export interface NextOccurrenceInput {
  rule: string;
  mode: RecurrenceMode;
  /** The occurrence being completed (the task's current do_date). */
  doDate: LocalDate;
  /** The day the user completed it — may be before or after `doDate`. */
  completedOn: LocalDate;
  /**
   * Where a fixed schedule counts from (the first ever occurrence). Needed for
   * COUNT/UNTIL and for "every 2 weeks" to stay on its original fortnight.
   * Defaults to `doDate`.
   */
  seriesStart?: LocalDate;
  pausedUntil?: LocalDate | null;
  exceptions?: readonly RecurrenceException[];
}

/**
 * The next do_date after completing an occurrence, or null when the series
 * has ended (UNTIL/COUNT exhausted).
 *
 * fixed:            the next scheduled date after max(doDate, completedOn) —
 *                   a late completion never yields a date in the past.
 * after_completion: counted from the completion date.
 */
export function nextOccurrence(input: NextOccurrenceInput): LocalDate | null {
  const { rule, mode, doDate, completedOn, pausedUntil, exceptions = [] } = input;
  if (pausedUntil && compareDates(completedOn, pausedUntil) < 0) return pausedUntil;

  const anchor = mode === "after_completion" ? completedOn : (input.seriesStart ?? doDate);
  let after = mode === "after_completion" ? completedOn : (compareDates(doDate, completedOn) > 0 ? doDate : completedOn);
  const exceptionFor = (d: LocalDate) => exceptions.find((e) => e.occurrenceDate.equals(d));

  for (let round = 0; round < 50; round++) {
    const candidates = occurrencesAfter(rule, anchor, after, 12);
    if (candidates.length === 0) return null;
    for (const d of candidates) {
      const ex = exceptionFor(d);
      if (!ex) return d;
      if (ex.kind === "move") return ex.movedTo;
    }
    after = candidates[candidates.length - 1];
  }
  return null;
}

export interface CompletionAdvance {
  /** The occurrence the completion is recorded against. */
  occurrenceDate: LocalDate;
  /** The new do_date, or null when the task is simply done. */
  nextDoDate: LocalDate | null;
}

/**
 * What completing a recurring task does to it. Completing early records the
 * completion against the scheduled occurrence and advances from it, so
 * finishing Friday's task on Wednesday does not create a second Friday task.
 */
export function advanceOnCompletion(input: NextOccurrenceInput): CompletionAdvance {
  return { occurrenceDate: input.doDate, nextDoDate: nextOccurrence(input) };
}

/**
 * "Change the rule": the series restarts from `today` forward. Returns the
 * new do_date and which pending exceptions no longer refer to a real
 * occurrence (the user is told how many were dropped).
 */
export function changeRule(input: {
  newRule: string;
  today: LocalDate;
  exceptions: readonly RecurrenceException[];
}): { doDate: LocalDate | null; droppedExceptions: RecurrenceException[] } {
  const first = occurrencesBetween(input.newRule, input.today, input.today, input.today.add({ days: FAR_FUTURE_DAYS }));
  const droppedExceptions = input.exceptions.filter((e) => compareDates(e.occurrenceDate, input.today) >= 0);
  return { doDate: first[0] ?? null, droppedExceptions };
}
