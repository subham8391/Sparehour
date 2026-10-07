// Today on another day (SCREENS.md §2.1, §24; DECISIONS.md "Today on another day"): `[` / `]` step the day, `T`
// comes back, and the day lives in the address — `/today?day=2026-10-08` — so a reload keeps it. Plain helpers,
// small enough for the keyboard layer that every shell carries.
import { localDate, type LocalDate } from "@/core/time";
import { monthName } from "@/core/time/format-day";

/** The day a `?day=` value names, or null for none, or one that is not a calendar date. */
export function parseDay(value: string | null | undefined): LocalDate | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  try {
    return localDate(value);
  } catch {
    return null;
  }
}

/** Where Today shows `day`: plain `/today` for today itself. */
export function dayHref(day: LocalDate, today: LocalDate): string {
  return day.equals(today) ? "/today" : `/today?day=${day.toString()}`;
}

/**
 * Shows `day` on Today. On Today itself only the address changes, in place (the router follows a replaced history
 * entry, so the page re-reads `?day=` with no navigation and no network); from anywhere else it goes there.
 */
export function openDay(day: LocalDate, today: LocalDate, from?: { pathname: string; go: (href: string) => void }): void {
  const href = dayHref(day, today);
  if (!from || from.pathname === "/today") window.history.replaceState(null, "", href);
  else from.go(href);
}

/**
 * The words quick-add files a new task on `day` with, ahead of its title (`N`, a click on free time): "today ",
 * "tomorrow ", "9 oct ". A day that has passed takes new tasks on today.
 */
export function dayWords(day: LocalDate, today: LocalDate): string {
  const n = day.since(today, { largestUnit: "days" }).days;
  if (n <= 0) return "today ";
  if (n === 1) return "tomorrow ";
  return `${day.day} ${monthName(day).toLowerCase()}${day.year === today.year ? "" : ` ${day.year}`} `;
}

/** "Tomorrow", "Yesterday", "In 3 days", "4 days ago": the day as the stepped header names it. */
export function daysAway(day: LocalDate, today: LocalDate): string {
  const n = day.since(today, { largestUnit: "days" }).days;
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n === 0) return "Today";
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}
