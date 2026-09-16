// Date and time recognition for quick-add. The relative vocabulary (today,
// tmr, fri, next fri, eow…) is hand-written so it is deterministic and
// zone-safe; chrono-node in strict mode adds absolute dates ("15 sept",
// "in 3 days"). Chrono's Date objects are never kept — only calendar fields.
// The English entry point only: the package root would carry every locale
// into the bundle (SYSTEM_DESIGN.md §11.6).
import * as chrono from "chrono-node/en";
import { Temporal, type LocalDate, type LocalTime } from "../time";

export interface DateMatch {
  start: number;
  end: number;
  date: LocalDate;
  /** "tonight" implies the evening as well as today. */
  evening: boolean;
}

export interface TimeMatch {
  start: number;
  end: number;
  time: LocalTime;
}

const WEEKDAY: Record<string, number> = {
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
  sun: 7, sunday: 7,
};

const WEEKDAY_RE = "monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun";

/** The weekday on or after `today`: "fri" on a Friday is today. */
export const weekdayOnOrAfter = (today: LocalDate, weekday: number): LocalDate =>
  today.add({ days: (weekday - today.dayOfWeek + 7) % 7 });

/** The Monday that starts next week. */
export const nextWeekMonday = (today: LocalDate): LocalDate =>
  today.add({ days: 8 - today.dayOfWeek });

const relativePatterns: { re: RegExp; resolve: (m: RegExpExecArray, today: LocalDate) => { date: LocalDate; evening?: boolean } | null }[] = [
  {
    re: /\bday after (?:tomorrow|tmrw|tmr)\b/gi,
    resolve: (_m, today) => ({ date: today.add({ days: 2 }) }),
  },
  {
    re: /\b(today|tod|tomorrow|tmrw|tmr|tonight)\b/gi,
    resolve: (m, today) => {
      const w = m[1].toLowerCase();
      if (w === "tonight") return { date: today, evening: true };
      if (w === "today" || w === "tod") return { date: today };
      return { date: today.add({ days: 1 }) };
    },
  },
  {
    // "last mon" is a phrase about the past, not a weekday token.
    re: new RegExp(`(?<!\\blast\\s)\\b(?:(next)\\s+)?(${WEEKDAY_RE})\\b`, "gi"),
    resolve: (m, today) => {
      const wd = WEEKDAY[m[2].toLowerCase()];
      return { date: m[1] ? nextWeekMonday(today).add({ days: wd - 1 }) : weekdayOnOrAfter(today, wd) };
    },
  },
  {
    re: /\bnext (week|month)\b/gi,
    resolve: (m, today) =>
      m[1].toLowerCase() === "week"
        ? { date: nextWeekMonday(today) }
        : { date: today.add({ months: 1 }).with({ day: 1 }) },
  },
  {
    re: /\bthis weekend\b/gi,
    resolve: (_m, today) => ({ date: weekdayOnOrAfter(today, 6) }),
  },
  {
    re: /\b(eow|eom)\b/gi,
    resolve: (m, today) =>
      m[1].toLowerCase() === "eow"
        ? { date: weekdayOnOrAfter(today, 5) }
        : { date: today.with({ day: today.daysInMonth }) },
  },
  {
    re: /\bin (\d{1,3}) (days?|weeks?|months?)\b/gi,
    resolve: (m, today) => {
      const n = Number(m[1]);
      const unit = m[2].toLowerCase();
      if (unit.startsWith("day")) return { date: today.add({ days: n }) };
      if (unit.startsWith("week")) return { date: today.add({ weeks: n }) };
      return { date: today.add({ months: n }) };
    },
  },
  {
    re: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    resolve: (m) => {
      try {
        return { date: Temporal.PlainDate.from({ year: +m[1], month: +m[2], day: +m[3] }, { overflow: "reject" }) };
      } catch {
        return null;
      }
    },
  },
];

const TIME_12H = /\b(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/gi;
const TIME_24H = /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/g;
const TIME_WORDS = /\b(?:at\s+)?(noon|midday|midnight)\b/gi;

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Keep the longest match at each position; drop anything that overlaps an earlier kept match. */
function dedupe<T extends { start: number; end: number }>(matches: T[]): T[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: T[] = [];
  for (const m of sorted) if (!out.some((k) => overlaps(k, m))) out.push(m);
  return out;
}

/** All relative and ISO dates in `text`, in order, non-overlapping. */
export function findDates(text: string, today: LocalDate): DateMatch[] {
  const found: DateMatch[] = [];
  for (const { re, resolve } of relativePatterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const r = resolve(m, today);
      if (r) found.push({ start: m.index, end: m.index + m[0].length, date: r.date, evening: r.evening ?? false });
    }
  }
  return dedupe(found);
}

/** All wall-clock times in `text`, in order, non-overlapping. */
export function findTimes(text: string): TimeMatch[] {
  const found: TimeMatch[] = [];
  let m: RegExpExecArray | null;
  TIME_12H.lastIndex = 0;
  while ((m = TIME_12H.exec(text)) !== null) {
    let hour = Number(m[1]);
    const minute = m[2] ? Number(m[2]) : 0;
    if (hour < 1 || hour > 12 || minute > 59) continue;
    if (m[3].toLowerCase() === "am") hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
    found.push({ start: m.index, end: m.index + m[0].length, time: Temporal.PlainTime.from({ hour, minute }) });
  }
  TIME_24H.lastIndex = 0;
  while ((m = TIME_24H.exec(text)) !== null) {
    found.push({ start: m.index, end: m.index + m[0].length, time: Temporal.PlainTime.from({ hour: Number(m[1]), minute: Number(m[2]) }) });
  }
  TIME_WORDS.lastIndex = 0;
  while ((m = TIME_WORDS.exec(text)) !== null) {
    const hour = m[1].toLowerCase() === "midnight" ? 0 : 12;
    found.push({ start: m.index, end: m.index + m[0].length, time: Temporal.PlainTime.from({ hour, minute: 0 }) });
  }
  return dedupe(found);
}

const strictParser = chrono.strict.clone();

export interface ChronoMatch {
  start: number;
  end: number;
  date: LocalDate;
  time: LocalTime | null;
}

const plainDate = (year: number, month: number, day: number): LocalDate | null => {
  try {
    return Temporal.PlainDate.from({ year, month, day }, { overflow: "reject" });
  } catch {
    return null;
  }
};

/** The next `month`/`day` on or after `today` (PRODUCT_SPEC.md §5.3 rule 5); Feb 29 waits for a leap year. */
function forward(month: number, day: number, today: LocalDate): LocalDate | null {
  for (let year = today.year; year <= today.year + 8; year++) {
    const d = plainDate(year, month, day);
    if (d && Temporal.PlainDate.compare(d, today) >= 0) return d;
  }
  return null;
}

/**
 * Absolute dates chrono can read with certainty ("15 sept", "oct 12 at 2pm",
 * "in 3 days"). Anything where the day is guessed is rejected. Only chrono's
 * calendar fields are used; the year is resolved here, forward from `today`,
 * so the result never depends on the host's zone or on chrono's own "is this
 * past?" arithmetic — which once turned today's date into next year's on a
 * +05:30 machine.
 */
export function findAbsoluteDates(text: string, today: LocalDate, offsetMinutes: number): ChronoMatch[] {
  // The reference is local midnight of `today` in the user's zone.
  const refDate = new Date(Date.UTC(today.year, today.month - 1, today.day) - offsetMinutes * 60_000);
  const results = strictParser.parse(text, { instant: refDate, timezone: offsetMinutes });
  const out: ChronoMatch[] = [];
  for (const r of results) {
    if (!r.start.isCertain("day") || !r.start.isCertain("month")) continue;
    const month = r.start.get("month");
    const day = r.start.get("day");
    if (month == null || day == null) continue;
    let end = r.index + r.text.trimEnd().length;
    let date: LocalDate | null = null;
    if (r.start.isCertain("year")) {
      const year = r.start.get("year");
      const explicit = year == null ? null : plainDate(year, month, day);
      // A stray two-digit number after the day ("3 oct 12") that would land in the past is not a
      // year: leave it in the title and resolve the date without it. A four-digit year is explicit.
      const stray = /\s+\d{2}$/.exec(r.text.trimEnd());
      if (explicit && !(stray && Temporal.PlainDate.compare(explicit, today) < 0)) date = explicit;
      else if (stray) {
        end -= stray[0].length;
        date = forward(month, day, today);
      } else continue;
    } else {
      date = forward(month, day, today);
    }
    if (!date) continue;
    const time = r.start.isCertain("hour")
      ? Temporal.PlainTime.from({ hour: r.start.get("hour") ?? 0, minute: r.start.get("minute") ?? 0 })
      : null;
    // chrono can swallow trailing blanks; keep the span tight so it never touches another token
    out.push({ start: r.index, end, date, time });
  }
  return out;
}
