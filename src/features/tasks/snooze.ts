// Smart snooze presets (PRODUCT_SPEC.md §8.6): This evening · Tomorrow ·
// In 4 hours · This weekend · Next week. "This weekend" is the next
// Saturday; "Next week" is next Monday. Pure: takes the moment and the
// user's day, returns the patch each preset would apply.
import { Temporal, type Instant, type LocalDate, type LocalTime } from "@/core/time";

export interface SnoozePatch {
  doDate: LocalDate;
  doTime: LocalTime | null;
  evening: boolean;
}

export interface SnoozePreset {
  id: "evening" | "tomorrow" | "in4h" | "weekend" | "nextweek";
  label: string;
  patch: SnoozePatch;
}

/** The next Saturday strictly after `day`. */
export function nextSaturday(day: LocalDate): LocalDate {
  const ahead = (6 - day.dayOfWeek + 7) % 7 || 7;
  return day.add({ days: ahead });
}

/** The next Monday strictly after `day`. */
export function nextMonday(day: LocalDate): LocalDate {
  const ahead = (1 - day.dayOfWeek + 7) % 7 || 7;
  return day.add({ days: ahead });
}

/** `now` plus four hours in the user's zone, rounded up to five minutes. */
export function inFourHours(now: Instant, zone: string): { doDate: LocalDate; doTime: LocalTime } {
  const zoned = now.toZonedDateTimeISO(zone).add({ hours: 4 });
  const rounded = zoned.round({ smallestUnit: "minute", roundingIncrement: 5, roundingMode: "ceil" });
  return { doDate: rounded.toPlainDate(), doTime: rounded.toPlainTime() };
}

export function snoozePresets(now: Instant, zone: string, today: LocalDate): SnoozePreset[] {
  const four = inFourHours(now, zone);
  return [
    { id: "evening", label: "This evening", patch: { doDate: today, doTime: null, evening: true } },
    { id: "tomorrow", label: "Tomorrow", patch: { doDate: today.add({ days: 1 }), doTime: null, evening: false } },
    { id: "in4h", label: "In 4 hours", patch: { doDate: four.doDate, doTime: four.doTime, evening: false } },
    { id: "weekend", label: "This weekend", patch: { doDate: nextSaturday(today), doTime: null, evening: false } },
    { id: "nextweek", label: "Next week", patch: { doDate: nextMonday(today), doTime: null, evening: false } },
  ];
}

export type { Temporal };
