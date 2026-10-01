// Where an instant falls on one planned day, in wall-clock minutes. The day
// rolls over at the person's hour, not at midnight, so 01:30 can still belong
// to yesterday's plan: then the whole of that day is behind us, not 90 minutes
// of it. Pure, so the timeline and the morning plan read "now" the same way.
import { compareDates, type Instant, type LocalDate } from "@/core/time";

export interface DayMinute {
  /** The minute of `day` that `now` is: 0 before the day starts, 1440 once it has ended. */
  minute: number;
  /** True when `now` falls on `day` itself, so a now line can be drawn. */
  onDay: boolean;
}

export function minuteOnDay(now: Instant, zone: string, day: LocalDate): DayMinute {
  const z = now.toZonedDateTimeISO(zone);
  const c = compareDates(z.toPlainDate(), day);
  if (c < 0) return { minute: 0, onDay: false };
  if (c > 0) return { minute: 24 * 60, onDay: false };
  return { minute: z.hour * 60 + z.minute, onDay: true };
}
