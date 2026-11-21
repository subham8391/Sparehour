// A day as a field or quick-add's restatement says it. Its own module, free of the web's screen parts, so the
// Android app says a day in the same words (docs/mobile/ANDROID_APP_SPEC.md §4.3); interpret.ts hands it on.
import type { LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";

/** "Today", "Tomorrow", "Yesterday", else "Thu 17 Sep" (with the year when it differs). */
export function dayLabel(date: LocalDate, today: LocalDate): string {
  const days = date.since(today, { largestUnit: "days" }).days;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return formatDay(date, { today });
}
