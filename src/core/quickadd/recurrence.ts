// "every 2 weeks on mon" ⇄ FREQ=WEEKLY;INTERVAL=2;BYDAY=MO
// Only the subset quick-add can express; the recurrence engine handles the rest.

const DAY_CODES: Record<string, string> = {
  mon: "MO", monday: "MO",
  tue: "TU", tues: "TU", tuesday: "TU",
  wed: "WE", wednesday: "WE",
  thu: "TH", thur: "TH", thurs: "TH", thursday: "TH",
  fri: "FR", friday: "FR",
  sat: "SA", saturday: "SA",
  sun: "SU", sunday: "SU",
};
const CODE_TO_WORD: Record<string, string> = { MO: "mon", TU: "tue", WE: "wed", TH: "thu", FR: "fri", SA: "sat", SU: "sun" };
const CODE_TO_WEEKDAY: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

const DAY_WORD = "monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun";
const DAY_LIST = `(?:${DAY_WORD})(?:\\s*(?:,|and|&|\\/)\\s*(?:${DAY_WORD}))*`;
const UNIT = "days?|weeks?|months?|years?";

/**
 * Matches the spec that follows "every"/"every!". Alternatives, longest first:
 *   3 days | 2 weeks on mon,wed | other week | weekday(s) | weekend(s) | day | mon,wed,fri | 15th
 */
export const RECUR_SPEC_RE = new RegExp(
  `^(?:` +
    `(\\d{1,3})\\s*(${UNIT})(?:\\s+on\\s+(${DAY_LIST}))?` + // 1,2,3
    `|other\\s+(${UNIT})` + // 4
    `|(weekdays?|workdays?)` + // 5
    `|(weekends?)` + // 6
    `|(day|week|month|year)(?:\\s+on\\s+(${DAY_LIST}))?` + // 7,8
    `|(${DAY_LIST})` + // 9
    `|([1-9]|[12]\\d|3[01])(?:st|nd|rd|th)` + // 10: a day of the month, "every 15th"
  `)(?![\\w-])`,
  "i",
);

const freqFor = (unit: string): string => {
  const u = unit.toLowerCase();
  if (u.startsWith("day")) return "DAILY";
  if (u.startsWith("week")) return "WEEKLY";
  if (u.startsWith("month")) return "MONTHLY";
  return "YEARLY";
};

const byDay = (list: string): string =>
  list
    .toLowerCase()
    .split(/\s*(?:,|and|&|\/)\s*/)
    .map((w) => DAY_CODES[w])
    .filter((c, i, arr): c is string => !!c && arr.indexOf(c) === i)
    .join(",");

/** Turns the text after "every" into an RRULE. Returns the rule and how many characters were consumed. */
export function specToRule(spec: string): { rule: string; length: number } | null {
  const m = RECUR_SPEC_RE.exec(spec);
  if (!m) return null;
  const parts: string[] = [];
  if (m[1]) {
    parts.push(`FREQ=${freqFor(m[2])}`);
    if (Number(m[1]) > 1) parts.push(`INTERVAL=${Number(m[1])}`);
    if (m[3]) parts.push(`BYDAY=${byDay(m[3])}`);
  } else if (m[4]) {
    parts.push(`FREQ=${freqFor(m[4])}`, "INTERVAL=2");
  } else if (m[5]) {
    parts.push("FREQ=WEEKLY", "BYDAY=MO,TU,WE,TH,FR");
  } else if (m[6]) {
    parts.push("FREQ=WEEKLY", "BYDAY=SA,SU");
  } else if (m[7]) {
    parts.push(`FREQ=${freqFor(m[7])}`);
    if (m[8]) parts.push(`BYDAY=${byDay(m[8])}`);
  } else if (m[9]) {
    parts.push("FREQ=WEEKLY", `BYDAY=${byDay(m[9])}`);
  } else if (m[10]) {
    // PRODUCT_SPEC.md §5.2 lists `every 15th`. The task's do-date lands on that day; both engines repeat a
    // monthly rule on its do-date's day (a month without a 29th–31st: the client skips it, the server's
    // skip policy uses the last day).
    parts.push("FREQ=MONTHLY", `BYMONTHDAY=${Number(m[10])}`);
  }
  return { rule: parts.join(";"), length: m[0].length };
}

/** The inverse of `specToRule` for the rules quick-add produces; used by `format`. */
export function ruleToSpec(rule: string): string {
  const fields = Object.fromEntries(rule.split(";").map((kv) => kv.split("=") as [string, string]));
  const interval = Number(fields.INTERVAL ?? 1);
  const freq = fields.FREQ;
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[freq] ?? "day";
  const days = fields.BYDAY ? fields.BYDAY.split(",").map((c) => CODE_TO_WORD[c] ?? c.toLowerCase()).join(",") : "";
  if (freq === "MONTHLY" && fields.BYMONTHDAY && interval === 1) return ordinal(Number(fields.BYMONTHDAY));
  if (freq === "WEEKLY" && fields.BYDAY === "MO,TU,WE,TH,FR" && interval === 1) return "weekday";
  if (freq === "WEEKLY" && fields.BYDAY === "SA,SU" && interval === 1) return "weekend";
  if (interval === 1 && freq === "WEEKLY" && days) return days;
  const head = interval === 1 ? unit : `${interval} ${unit}s`;
  return days ? `${head} on ${days}` : head;
}

function ordinal(n: number): string {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${tail}`;
}

/** The day of the month a monthly rule names (BYMONTHDAY), or null. */
export function ruleMonthDay(rule: string): number | null {
  const m = /(?:^|;)BYMONTHDAY=(\d{1,2})(?:;|$)/.exec(rule);
  return m ? Number(m[1]) : null;
}

/** ISO weekdays (1–7) named by the rule's BYDAY, or null when the rule has none. */
export function ruleWeekdays(rule: string): number[] | null {
  const m = /(?:^|;)BYDAY=([^;]+)/.exec(rule);
  if (!m) return null;
  return m[1].split(",").map((c) => CODE_TO_WEEKDAY[c]).filter((d): d is number => d != null);
}
