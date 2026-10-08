"use client";
// What each day of the Calendar draws (SCREENS.md §4): its capacity — Upcoming's multi-day hook, so a header's
// readout and Upcoming's never disagree, and today's is Today's own — and its blocks and titled meetings, read the
// way Today reads its one day (use-today.ts): a block's title from the block or its task and marked done with it,
// a private calendar's events as "Busy", a calendar switched off not at all, an unanswered invitation hatched.
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import type { Capacity } from "@/core/capacity";
import { instant, type Instant, type LocalDate } from "@/core/time";
import { normaliseTimestamp, type Settings } from "@/data/mappers";
import { CALENDARS_FULL_SQL, type CalendarFullRow } from "@/data/queries/calendar";
import { monthsBack } from "@/data/queries/shell";
import { BLOCKS_AROUND_SQL, EVENTS_AROUND_SQL } from "@/data/queries/today";
import type { CalendarEventRow, TimeBlockRow } from "@/data/schema.client";
import { BLOCK_TASKS_SQL, timelineBlocks, type BlockTask, type TimelineBlock, type TimelineMeeting } from "@/features/today/hooks/use-today";
import { calendarMonths, useWeekCapacity } from "@/features/upcoming/use-week-capacity";

export interface CalendarDay {
  day: LocalDate;
  capacity: Capacity | null;
  blocks: TimelineBlock[];
  meetings: TimelineMeeting[];
}

/** A day's timed meetings with the titles a person may see (as Today's `meetings`). */
export function dayMeetings(rows: readonly CalendarEventRow[], day: LocalDate, zone: string, calendars: readonly Pick<CalendarFullRow, "id" | "read" | "private">[]): TimelineMeeting[] {
  const hiddenIds = new Set(calendars.filter((c) => c.read === 0).map((c) => c.id));
  const privateIds = new Set(calendars.filter((c) => c.private === 1).map((c) => c.id));
  const out: TimelineMeeting[] = [];
  for (const e of rows) {
    if (e.all_day || !e.start_at || !e.end_at) continue;
    if (e.calendar_id && hiddenIds.has(e.calendar_id)) continue;
    const start = instant(normaliseTimestamp(e.start_at)).toZonedDateTimeISO(zone);
    const end = instant(normaliseTimestamp(e.end_at)).toZonedDateTimeISO(zone);
    if (!start.toPlainDate().equals(day)) continue;
    const hidden = e.calendar_id ? privateIds.has(e.calendar_id) : false;
    out.push({
      start: start.hour * 60 + start.minute,
      end: end.toPlainDate().equals(day) ? end.hour * 60 + end.minute : 24 * 60,
      title: hidden || !e.summary ? "Busy" : e.summary,
      unanswered: e.self_response === "needsAction",
    });
  }
  return out;
}

export function useCalendarDays({
  days,
  today,
  now,
  settings,
  tasks,
}: {
  days: readonly LocalDate[];
  today: LocalDate;
  now: Instant;
  settings: Settings | null;
  /** Open tasks already in hand (today's), so a block knows its task's title before its own query lands. */
  tasks: ReadonlyMap<string, BlockTask>;
}): { days: CalendarDay[]; connected: boolean } {
  const first = days[0];
  const last = days[days.length - 1];
  const zone = settings?.timezone ?? "UTC";
  const around: [string, string] = [first.subtract({ days: 1 }).toString(), last.add({ days: 1 }).toString()];
  const capacity = useWeekCapacity({ from: first, to: last, today, now, settings });
  const months = useMemo(() => calendarMonths(today, first, last), [today, first, last]);
  const { data: eventRows } = useQuery<CalendarEventRow>(EVENTS_AROUND_SQL, around, {
    streams: [{ name: "calendar_window", parameters: { months }, ttl: 60 * 60 * 24 }],
  });
  const { data: blockRows } = useQuery<TimeBlockRow>(BLOCKS_AROUND_SQL, around);
  const { data: calendarRows } = useQuery<CalendarFullRow>(CALENDARS_FULL_SQL);
  // The same subscription Today keeps, so a block whose task was finished stays marked done.
  const doneMonths = useMemo(() => monthsBack(today, 1), [today]);
  const { data: blockTaskRows } = useQuery<{ id: string; title: string | null; state: string | null }>(BLOCK_TASKS_SQL, around, {
    streams: [{ name: "logbook", parameters: { months: doneMonths }, ttl: 60 * 60 }],
  });

  return useMemo(() => {
    const blockTasks = new Map<string, BlockTask>(tasks);
    for (const r of blockTaskRows ?? []) blockTasks.set(r.id, { title: r.title, state: r.state });
    return {
      connected: (calendarRows ?? []).length > 0,
      days: days.map((day) => ({
        day,
        capacity: capacity.byDay.get(day.toString()) ?? null,
        blocks: timelineBlocks(blockRows ?? [], blockTasks, zone, day),
        meetings: dayMeetings(eventRows ?? [], day, zone, calendarRows ?? []),
      })),
    };
  }, [days, capacity, blockRows, blockTaskRows, eventRows, calendarRows, tasks, zone]);
}
