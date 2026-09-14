// Dates as the interface writes them: "Thu 17 Sep", "Monday 14 September",
// "5 Jan 2027". Hand-rolled English rather than Intl, because ICU versions
// disagree on details ("Sept", a comma before the year) and the design
// (DESIGN_SYSTEM.md §3) fixes the form.
import type { Temporal } from "temporal-polyfill";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface FormatDayOptions {
  /** "short" = Thu, "long" = Thursday, "none" = no weekday. Default short. */
  weekday?: "short" | "long" | "none";
  /** "short" = Sep, "long" = September. Default short. */
  month?: "short" | "long";
  /** Append the year. Default: only when it differs from `today`'s, if `today` is given. */
  year?: boolean;
  today?: Temporal.PlainDate;
}

export function weekdayName(date: Temporal.PlainDate, form: "short" | "long" = "short"): string {
  const name = WEEKDAYS[date.dayOfWeek - 1];
  return form === "short" ? name.slice(0, 3) : name;
}

export function monthName(date: Temporal.PlainDate, form: "short" | "long" = "short"): string {
  const name = MONTHS[date.month - 1];
  return form === "short" ? name.slice(0, 3) : name;
}

export function formatDay(date: Temporal.PlainDate, opts: FormatDayOptions = {}): string {
  const weekday = opts.weekday ?? "short";
  const showYear = opts.year ?? (opts.today ? opts.today.year !== date.year : false);
  const parts: string[] = [];
  if (weekday !== "none") parts.push(weekdayName(date, weekday));
  parts.push(`${date.day} ${monthName(date, opts.month ?? "short")}`);
  if (showYear) parts.push(String(date.year));
  return parts.join(" ");
}
