// Minutes of a day, to and from what blocks store and what a time field holds. Small, so the detail's block
// rows, the timeline's toolbar and the placing hook share it without carrying one another.
import { timeFromMinutes, toInstant, type LocalDate } from "@/core/time";

/** The ISO instant of a minute of `day` in `zone`; 24:00 is the next midnight. */
export function instantAt(day: LocalDate, zone: string, minute: number): string {
  return (minute >= 24 * 60 ? toInstant(day.add({ days: 1 }), timeFromMinutes(0), zone) : toInstant(day, timeFromMinutes(minute), zone)).toString();
}

/** "09:30" → 570, "24:00" → 1440; null for anything else. */
export function minutesOfField(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h === 24 && min === 0) return 24 * 60;
  return h < 24 && min < 60 ? h * 60 + min : null;
}
