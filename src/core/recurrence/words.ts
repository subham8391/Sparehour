// A repeat rule in plain words, for the task detail's header (SCREENS.md §10
// "Repeats every Monday · next Mon 16") and the series prompts. Pure string
// work on the RRULE subset quick-add writes; no rrule import, so it costs a
// shell nothing.
import type { RecurrenceMode } from "../types";

const DAY_NAMES: Record<string, string> = { MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday", FR: "Friday", SA: "Saturday", SU: "Sunday" };
const UNITS: Record<string, string> = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function fieldsOf(rule: string): Record<string, string> {
  return Object.fromEntries(
    rule
      .split(";")
      .filter(Boolean)
      .map((kv) => {
        const at = kv.indexOf("=");
        return [kv.slice(0, at).toUpperCase(), kv.slice(at + 1).toUpperCase()];
      }),
  );
}

/** "Monday", "Monday and Thursday", "Monday, Wednesday and Friday". */
function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function ordinal(n: number): string {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : (({ 1: "st", 2: "nd", 3: "rd" }) as Record<number, string>)[n % 10] ?? "th";
  return `${n}${tail}`;
}

/** A weekday code with an optional position ("MO", "1MO", "-1FR") in words: "Monday", "first Monday", "last Friday". */
function dayWords(code: string): string {
  const m = /^([+-]?\d{1,2})?([A-Z]{2})$/.exec(code);
  if (!m) return code.toLowerCase();
  const name = DAY_NAMES[m[2]] ?? m[2].toLowerCase();
  if (!m[1]) return name;
  const n = Number(m[1]);
  const position = n === -1 ? "last" : n > 0 && n <= 5 ? ["first", "second", "third", "fourth", "fifth"][n - 1] : ordinal(n);
  return `${position} ${name}`;
}

/**
 * The rule as a phrase that follows "Repeats": "every Monday", "every weekday", "every 2 weeks on Wednesday",
 * "every month on the 15th", "every 3 days after completion". Anything it does not know reads "on a schedule".
 */
export function ruleWords(rule: string, mode: RecurrenceMode | null = "fixed"): string {
  const f = fieldsOf(rule);
  const unit = UNITS[f.FREQ];
  if (!unit) return "on a schedule";
  const n = Number(f.INTERVAL ?? 1) || 1;
  const days = f.BYDAY ? f.BYDAY.split(",") : [];
  let words: string;
  if (f.FREQ === "WEEKLY" && n === 1 && f.BYDAY === "MO,TU,WE,TH,FR") words = "every weekday";
  else if (f.FREQ === "WEEKLY" && n === 1 && f.BYDAY === "SA,SU") words = "every weekend day";
  else if (f.FREQ === "WEEKLY" && n === 1 && days.length > 0) words = `every ${listWords(days.map(dayWords))}`;
  else {
    words = n === 1 ? `every ${unit}` : `every ${n} ${unit}s`;
    if (days.length > 0) words += ` on ${f.FREQ === "MONTHLY" ? "the " : ""}${listWords(days.map(dayWords))}`;
    else if (f.BYMONTHDAY && f.FREQ === "YEARLY" && f.BYMONTH) words += ` on ${Number(f.BYMONTHDAY)} ${MONTHS[Number(f.BYMONTH) - 1] ?? ""}`.trimEnd();
    else if (f.BYMONTHDAY) words += ` on the ${f.BYMONTHDAY.split(",").map((d) => (Number(d) === -1 ? "last day" : ordinal(Number(d)))).join(" and ")}`;
  }
  return mode === "after_completion" ? `${words} after completion` : words;
}
