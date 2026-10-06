// Series edits on a repeating task (SYSTEM_DESIGN.md §5.2 "Series edits";
// SCREENS.md §10): which occurrence the task stands for, the one after it,
// a rule moved onto another day, and the first occurrence on or after a day.
// Calendar dates only, like the rest of the engine; loaded with rrule, never
// in an app shell.
import { compareDates, type LocalDate } from "../time";
import type { RecurrenceException, RecurrenceMode } from "../types";
import { nextOccurrence, occurrencesAfter } from "./index";

const CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const codeOf = (d: LocalDate) => CODES[d.dayOfWeek - 1];
const later = (a: LocalDate, b: LocalDate) => (compareDates(a, b) >= 0 ? a : b);

type Fields = [string, string][];
const parse = (rule: string): Fields =>
  rule
    .split(";")
    .filter(Boolean)
    .map((kv) => {
      const at = kv.indexOf("=");
      return [kv.slice(0, at).toUpperCase(), kv.slice(at + 1)];
    });
const get = (f: Fields, key: string) => f.find(([k]) => k === key)?.[1];
const put = (f: Fields, key: string, value: string | null): Fields => {
  const rest = f.filter(([k]) => k !== key);
  if (value === null) return rest;
  const at = f.findIndex(([k]) => k === key);
  if (at === -1) return [...rest, [key, value]];
  return [...f.slice(0, at), [key, value], ...f.slice(at + 1)];
};
const unparse = (f: Fields) => f.map(([k, v]) => `${k}=${v}`).join(";");

/**
 * The scheduled date of the occurrence a task stands for. A task moved "just this once" sits on the day it was
 * moved to, but it is still the occurrence it was scheduled as, and the series counts on from there — so it goes
 * back to its rule afterwards.
 */
export function currentOccurrence(doDate: LocalDate | null, today: LocalDate, exceptions: readonly RecurrenceException[]): LocalDate {
  const day = doDate ?? today;
  let scheduled: LocalDate | null = null;
  for (const e of exceptions) {
    if (e.kind === "move" && e.movedTo.equals(day) && (!scheduled || compareDates(e.occurrenceDate, scheduled) > 0)) scheduled = e.occurrenceDate;
  }
  return scheduled ?? day;
}

export interface FollowingInput {
  rule: string;
  mode: RecurrenceMode;
  /** The occurrence being closed or looked past: the task's current occurrence (see currentOccurrence). */
  occurrence: LocalDate;
  today: LocalDate;
  pausedUntil?: LocalDate | null;
  exceptions?: readonly RecurrenceException[];
}

/**
 * The occurrence after the current one: where "Skip this occurrence" moves the task, and the "next" the detail's
 * header names. A fixed schedule never lands before today (a skipped day already missed goes to the first one
 * still ahead, today included); an after-completion one counts from today or the occurrence, whichever is later.
 */
export function followingOccurrence({ rule, mode, occurrence, today, pausedUntil = null, exceptions = [] }: FollowingInput): LocalDate | null {
  const from = mode === "after_completion" ? later(occurrence, today) : today.subtract({ days: 1 });
  return nextOccurrence({ rule, mode, doDate: occurrence, completedOn: from, pausedUntil, exceptions });
}

/**
 * The rule with the parts it leaves to its anchor written out ("every week" anchored on a Tuesday is every
 * Tuesday), so it can be counted from another anchor of the same schedule and still mean the same days.
 */
function withAnchorParts(rule: string, anchor: LocalDate): string {
  let f = parse(rule);
  const freq = get(f, "FREQ");
  if (freq === "WEEKLY" && !get(f, "BYDAY")) f = put(f, "BYDAY", codeOf(anchor));
  else if (freq === "MONTHLY" && !get(f, "BYDAY") && !get(f, "BYMONTHDAY")) f = put(f, "BYMONTHDAY", String(anchor.day));
  else if (freq === "YEARLY" && !get(f, "BYDAY") && !get(f, "BYMONTH") && !get(f, "BYMONTHDAY")) f = put(put(f, "BYMONTH", String(anchor.month)), "BYMONTHDAY", String(anchor.day));
  return unparse(f);
}

/** An anchor on or before `from` in the same phase as `anchor` (whole intervals back), or `anchor` itself for a counted rule. */
function alignBack(rule: string, anchor: LocalDate, from: LocalDate): LocalDate {
  const f = parse(rule);
  if (get(f, "COUNT") || get(f, "UNTIL")) return anchor;
  const n = Math.max(1, Number(get(f, "INTERVAL") ?? 1) || 1);
  const days = anchor.since(from, { largestUnit: "days" }).days;
  switch (get(f, "FREQ")) {
    case "DAILY":
      return anchor.subtract({ days: Math.ceil(days / n) * n });
    case "WEEKLY":
      return anchor.subtract({ days: Math.ceil(days / (7 * n)) * 7 * n });
    case "MONTHLY": {
      let at = anchor.subtract({ months: Math.ceil(((anchor.year - from.year) * 12 + anchor.month - from.month) / n) * n });
      while (compareDates(at, from) > 0) at = at.subtract({ months: n });
      return at;
    }
    default: {
      let at = anchor.subtract({ years: Math.ceil((anchor.year - from.year) / n) * n });
      while (compareDates(at, from) > 0) at = at.subtract({ years: n });
      return at;
    }
  }
}

/**
 * The first occurrence on or after `from` of the schedule `rule` runs on from `anchor` — also when `from` comes
 * before the anchor (resuming a pause early lands on the first day of the schedule still ahead). Null when the
 * rule has ended.
 */
export function firstOnOrAfter(rule: string, anchor: LocalDate, from: LocalDate): LocalDate | null {
  const explicit = withAnchorParts(rule, anchor);
  const start = compareDates(from, anchor) < 0 ? alignBack(explicit, anchor, from) : anchor;
  return occurrencesAfter(explicit, start, from.subtract({ days: 1 }), 1)[0] ?? null;
}

/** "first", "second"… or "last" (-1) Monday of its month. */
function positionInMonth(d: LocalDate): number {
  return d.day + 7 > d.daysInMonth ? -1 : Math.ceil(d.day / 7);
}

/**
 * "Change the rule" from a moved day (SCREENS.md §10): the rule rewritten so the day the person picked is on it.
 * Every Monday moved to a Wednesday becomes every Wednesday (one day of several is swapped, the others kept); the
 * 16th of the month becomes the 20th; the second Tuesday becomes that weekday at that place. A rule with nothing
 * tied to a weekday or a date (every 3 days, every week) counts from the new day as it is.
 */
export function rebaseRule(rule: string, from: LocalDate, to: LocalDate): string {
  let f = parse(rule);
  const freq = get(f, "FREQ");
  const byDay = get(f, "BYDAY");
  if (freq === "WEEKLY" && byDay) {
    const days = byDay.split(",");
    const target = codeOf(to);
    if (days.includes(target)) return unparse(f);
    const swapped = days.includes(codeOf(from)) ? days.map((d) => (d === codeOf(from) ? target : d)) : days.length === 1 ? [target] : [...days, target];
    f = put(f, "BYDAY", [...new Set(swapped)].sort((a, b) => CODES.indexOf(a as (typeof CODES)[number]) - CODES.indexOf(b as (typeof CODES)[number])).join(","));
  } else if (freq === "MONTHLY" && byDay) {
    f = put(put(f, "BYDAY", `${positionInMonth(to)}${codeOf(to)}`), "BYSETPOS", null);
  } else if ((freq === "MONTHLY" || freq === "YEARLY") && get(f, "BYMONTHDAY")) {
    f = put(f, "BYMONTHDAY", String(to.day));
    if (freq === "YEARLY" && get(f, "BYMONTH")) f = put(f, "BYMONTH", String(to.month));
  } else if (freq === "YEARLY" && get(f, "BYMONTH")) {
    f = put(f, "BYMONTH", String(to.month));
  }
  return unparse(f);
}

/** The exceptions a change of rule drops: those on today or later, which named days of the old schedule. */
export function exceptionsFrom<T extends { occurrenceDate: LocalDate }>(exceptions: readonly T[], today: LocalDate): T[] {
  return exceptions.filter((e) => compareDates(e.occurrenceDate, today) >= 0);
}
