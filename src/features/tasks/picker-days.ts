// The day picker's days and what each reads as, alone: with none of the picker's screen parts (day-picker.tsx), so
// the Android app's "Pick a date" lists the same days under the same names (docs/mobile/ANDROID_APP_SPEC.md §4.3).
// day-picker.tsx hands these on, so every import of them from the picker stays as it was.
import type { LocalDate } from "@/core/time";
import { weekdayName } from "@/core/time/format-day";

/** How many days the picker lists before "Pick a date". */
export const PICKER_DAYS = 7;

/** The picker's days: today and the six after it. */
export function pickerDays(today: LocalDate, count = PICKER_DAYS): LocalDate[] {
  return Array.from({ length: count }, (_, i) => today.add({ days: i }));
}

/** "Today", "Tomorrow", else "Thu 8": what a day reads as in the list. */
export function pickerDayName(day: LocalDate, today: LocalDate): string {
  const ahead = day.since(today, { largestUnit: "days" }).days;
  return ahead === 0 ? "Today" : ahead === 1 ? "Tomorrow" : `${weekdayName(day)} ${day.day}`;
}
