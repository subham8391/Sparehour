// The two lines under Today's date: the day's all-day events, and its meetings (REMINDERS_AND_AI_SPEC.md §5):
// "Meetings: 11:00 Daily Standup · 14:00 1:1 with Priya". The ribbon and the timeline draw
// the busy time; this names what is still to come, so a person reading the list sees their
// meetings without opening the Day view. The web and the phone both read this one file, so
// they say the same words. It reads the device's rows the way the AI tools read the server's
// (`server/mcp/core.ts`, `days()`), bar a declined meeting, which is not listed here at all.
import { Temporal, compareDates, instant, localDate, type Instant, type LocalDate } from "@/core/time";
import { normaliseTimestamp } from "@/data/mappers";
import type { CalendarFullRow } from "@/data/queries/calendar";
import type { CalendarEventRow } from "@/data/schema.client";

/** How many meetings the line names before it counts the rest. */
export const MEETINGS_NAMED = 3;

/** A meeting on the line: its start as "HH:MM" in the person's zone, and the title they may see. */
export interface DayMeeting {
  start: string;
  /** "Busy" when the calendar is private or the event has no summary. */
  title: string;
}

export interface DayMeetingsInput {
  /** The day shown. */
  day: LocalDate;
  /** The person's today (its rollover hour counted), which says whether the day shown is today, later or past. */
  today: LocalDate;
  zone: string;
  now: Instant;
  /** Each calendar's "read" switch; a calendar not listed is read. */
  readByCalendar: ReadonlyMap<string, boolean>;
  /** Calendars marked private: their events read "Busy". */
  privateIds: ReadonlySet<string>;
}

/**
 * The timed events the day counts as meetings, in order of start: not all-day, cancelled, declined, Sparehour's own
 * blocks or from a calendar that is switched off. Today keeps only those that have not ended; a later day keeps all;
 * a day that has passed has none (its own note already speaks of its meetings).
 */
export function dayMeetings(rows: readonly CalendarEventRow[], { day, today, zone, now, readByCalendar, privateIds }: DayMeetingsInput): DayMeeting[] {
  const ahead = compareDates(day, today);
  if (ahead < 0) return [];
  const kept: { at: Instant; start: string; title: string }[] = [];
  for (const e of rows) {
    if (e.all_day || !e.start_at || !e.end_at) continue;
    if (e.status === "cancelled" || e.self_response === "declined" || e.is_ours) continue;
    if (e.calendar_id && readByCalendar.get(e.calendar_id) === false) continue;
    const at = instant(normaliseTimestamp(e.start_at));
    const start = at.toZonedDateTimeISO(zone);
    if (!start.toPlainDate().equals(day)) continue;
    if (ahead === 0 && Temporal.Instant.compare(instant(normaliseTimestamp(e.end_at)), now) <= 0) continue;
    const hidden = e.calendar_id ? privateIds.has(e.calendar_id) : false;
    kept.push({ at, start: `${String(start.hour).padStart(2, "0")}:${String(start.minute).padStart(2, "0")}`, title: hidden || !e.summary ? "Busy" : e.summary });
  }
  return kept.sort((a, b) => Temporal.Instant.compare(a.at, b.at)).map(({ start, title }) => ({ start, title }));
}

/** The line itself: the first three by name, then "+2 more"; null with no meeting, so nothing is drawn. */
export function meetingsLine(meetings: readonly DayMeeting[]): string | null {
  if (meetings.length === 0) return null;
  const named = meetings.slice(0, MEETINGS_NAMED).map((m) => `${m.start} ${m.title}`);
  const rest = meetings.length - named.length;
  return `Meetings: ${[...named, ...(rest > 0 ? [`+${rest} more`] : [])].join(" · ")}`;
}

/** What the line is made from, as Today's model holds it (hooks/use-today.ts). */
export interface MeetingsLineModel {
  calendarEvents: readonly CalendarEventRow[];
  calendars: readonly Pick<CalendarFullRow, "id" | "read" | "private">[];
  day: LocalDate;
  today: LocalDate;
  settings: { timezone: string } | null;
}

const calendarsOf = (m: MeetingsLineModel) => ({
  readByCalendar: new Map(m.calendars.map((c) => [c.id, c.read !== 0])),
  privateIds: new Set(m.calendars.filter((c) => c.private === 1).map((c) => c.id)),
});

/**
 * The line for the day Today shows, from its model: what the web's island and the phone's Today both call. Worked out
 * here and not in the model, so the web's first download does not carry it (SYSTEM_DESIGN.md §11.6).
 */
export function meetingsLineOf(m: MeetingsLineModel, now: Instant): string | null {
  return meetingsLine(dayMeetings(m.calendarEvents, { day: m.day, today: m.today, zone: m.settings?.timezone ?? "UTC", now, ...calendarsOf(m) }));
}

/**
 * The day's all-day events by title, for the line above the meetings (SYSTEM_DESIGN.md §5.4: flagged on the day's
 * header, never busy). Private calendars say "Busy"; out-of-office days have their own line on the ribbon.
 */
export function allDayTitles(rows: readonly CalendarEventRow[], day: LocalDate, readByCalendar: ReadonlyMap<string, boolean>, privateIds: ReadonlySet<string>): string[] {
  const iso = day.toString();
  return rows
    .filter((e) => e.all_day && e.start_date && e.start_date <= iso && iso < (e.end_date ?? localDate(e.start_date).add({ days: 1 }).toString()))
    .filter((e) => e.status !== "cancelled" && e.self_response !== "declined" && e.event_type !== "outOfOffice")
    .filter((e) => !e.calendar_id || readByCalendar.get(e.calendar_id) !== false)
    .map((e) => (e.calendar_id && privateIds.has(e.calendar_id)) || !e.summary ? "Busy" : e.summary);
}

/** The all-day titles of the day Today shows, from its model. */
export function allDayOf(m: MeetingsLineModel): string[] {
  const { readByCalendar, privateIds } = calendarsOf(m);
  return allDayTitles(m.calendarEvents, m.day, readByCalendar, privateIds);
}
