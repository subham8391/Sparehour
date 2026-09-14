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
    re: new RegExp(`\\b(?:(next)\\s+)?(${WEEKDAY_RE})\\b`, "gi"),
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
        return { date: Temporal.PlainDate.from({ year: +m[1], month: +m[2], day: +m[3] }) };
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

/**
 * Absolute dates chrono can read with certainty ("15 sept", "oct 12 at 2pm",
 * "in 3 days"). Anything where the day is guessed is rejected.
 */
export function findAbsoluteDates(text: string, today: LocalDate, offsetMinutes: number): ChronoMatch[] {
  const refDate = new Date(Date.UTC(today.year, today.month - 1, today.day, 12, 0, 0));
  const results = strictParser.parse(text, { instant: refDate, timezone: offsetMinutes }, { forwardDate: true });
  const out: ChronoMatch[] = [];
  for (const r of results) {
    if (!r.start.isCertain("day") || !r.start.isCertain("month")) continue;
    const year = r.start.get("year");
    const month = r.start.get("month");
    const day = r.start.get("day");
    if (year == null || month == null || day == null) continue;
    let date: LocalDate;
    try {
      date = Temporal.PlainDate.from({ year, month, day });
    } catch {
      continue;
    }
    const time = r.start.isCertain("hour")
      ? Temporal.PlainTime.from({ hour: r.start.get("hour") ?? 0, minute: r.start.get("minute") ?? 0 })
      : null;
    // chrono can swallow trailing blanks; keep the span tight so it never touches another token
    out.push({ start: r.index, end: r.index + r.text.trimEnd().length, date, time });
  }
  return out;
}
