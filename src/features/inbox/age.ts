// An Inbox row's age (SCREENS.md §5): "added 2d", in days and factually — never a warning, never red. Pure.
import { dateOf, instant, type LocalDate } from "@/core/time";
import { normaliseTimestamp } from "@/data/mappers";

/** "added today", "added 1d", "added 12d": whole days between the day it was captured (in `zone`) and `today`. */
export function addedLabel(createdAt: string | null | undefined, today: LocalDate, zone: string): string | null {
  if (!createdAt) return null;
  let day: LocalDate;
  try {
    day = dateOf(instant(normaliseTimestamp(createdAt)), zone);
  } catch {
    return null;
  }
  const days = day.until(today, { largestUnit: "days" }).days;
  return days <= 0 ? "added today" : `added ${days}d`;
}
