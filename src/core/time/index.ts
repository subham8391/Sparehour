// The time primitives every engine is built on. Two rules the whole codebase
// obeys: never add 86 400 000 ms to get tomorrow, and never store a do-date as
// a timestamp. See docs/engineering/SYSTEM_DESIGN.md §5.0.
import { Temporal } from "temporal-polyfill";

export { Temporal };

/** A calendar day with no zone, e.g. 2026-09-15. */
export type LocalDate = Temporal.PlainDate;
/** A wall-clock time with no zone, e.g. 14:30. */
export type LocalTime = Temporal.PlainTime;
/** An absolute moment. */
export type Instant = Temporal.Instant;
/** An IANA zone id, e.g. "Europe/London". */
export type Zone = string;

export const localDate = (iso: string): LocalDate => Temporal.PlainDate.from(iso);
export const localTime = (iso: string): LocalTime => Temporal.PlainTime.from(iso);
export const instant = (iso: string): Instant => Temporal.Instant.from(iso);

export const toInstant = (d: LocalDate, t: LocalTime, zone: Zone): Instant =>
  d.toZonedDateTime({ timeZone: zone, plainTime: t }).toInstant();

export const dateOf = (i: Instant, zone: Zone): LocalDate =>
  i.toZonedDateTimeISO(zone).toPlainDate();

export const timeOf = (i: Instant, zone: Zone): LocalTime =>
  i.toZonedDateTimeISO(zone).toPlainTime();

export interface DaySettings {
  timezone: Zone;
  /** The hour (0–6) at which a new day starts; 04:00 by default, so 01:30 still belongs to yesterday. */
  dayRolloverHour: number;
}

/** The only correct way to ask "what day is it for this user right now". */
export const todayFor = (settings: DaySettings, now: Instant): LocalDate => {
  const z = now.toZonedDateTimeISO(settings.timezone);
  return z.hour < settings.dayRolloverHour
    ? z.toPlainDate().subtract({ days: 1 })
    : z.toPlainDate();
};

export const addDays = (d: LocalDate, days: number): LocalDate => d.add({ days });

export const compareDates = (a: LocalDate, b: LocalDate): -1 | 0 | 1 =>
  Temporal.PlainDate.compare(a, b) as -1 | 0 | 1;

export const isSameDay = (a: LocalDate, b: LocalDate): boolean => a.equals(b);

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export const weekdayOf = (d: LocalDate): number => d.dayOfWeek;

/** Minutes since midnight, 0–1439. */
export const minutesOfDay = (t: LocalTime): number => t.hour * 60 + t.minute;

/** Signed minutes from `a` to `b` on the same day. */
export const minutesBetween = (a: LocalTime, b: LocalTime): number =>
  minutesOfDay(b) - minutesOfDay(a);

export const timeFromMinutes = (minutes: number): LocalTime => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return Temporal.PlainTime.from({ hour: Math.floor(m / 60), minute: m % 60 });
};

/**
 * "3h 20m", "1h", "45m", "0m". With `padMinutes`, whole hours read "2h 00m"
 * so figures line up in a column.
 */
export const formatMinutes = (
  minutes: number,
  options: { padMinutes?: boolean } = {},
): string => {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0 && !options.padMinutes) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
};

/** "09:45" — always 24-hour, zero-padded, so times line up. */
export const formatTime = (t: LocalTime): string =>
  `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
