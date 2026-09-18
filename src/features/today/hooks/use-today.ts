"use client";
// Composes the local data with the core engines: capacity, carried-over and
// today's list, all reactive to the local database.
import { useMemo } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { capacityFor, type Capacity } from "@/core/capacity";
import { carriedOver, shouldAsk } from "@/core/rollover/carried"; // not the index: that carries the recurrence engine (§11.6)
import { Temporal, instant, todayFor, type LocalDate } from "@/core/time";
import type { Task, TaskId } from "@/core/types";
import { normaliseTimestamp, toCapacityBlock, toCapacityEvent, toCapacityTask, toSettings, toTask, toWorkWindow, type Settings } from "@/data/mappers";
import { BLOCKS_AROUND_SQL, EVENTS_AROUND_SQL, SETTINGS_SQL, TASKS_THROUGH_TODAY_SQL, WORK_HOURS_SQL, dayWindowParams, monthsAround } from "@/data/queries/today";
import { CALENDARS_FULL_SQL, CALENDAR_CONNECTIONS_SQL, type CalendarConnectionRow, type CalendarFullRow } from "@/data/queries/calendar";
import { TaskRepo } from "@/data/repositories/task-repo";
import type { CalendarEventRow, TaskRow, TimeBlockRow, UserSettingsRow, WorkHoursRow } from "@/data/schema.client";

/** A block as the timeline draws it: minutes of the local day. */
export interface TimelineBlock {
  id: string;
  taskId: TaskId | null;
  title: string;
  start: number;
  end: number;
  locked: boolean;
}

/** A timed meeting as the timeline labels it: minutes of the local day and the title a person may see. */
export interface TimelineMeeting {
  start: number;
  end: number;
  /** "Busy" when the calendar is private or the event has no summary. */
  title: string;
}

export interface TodayModel {
  ready: boolean;
  today: LocalDate;
  settings: Settings | null;
  capacity: Capacity | null;
  carried: (Task & { ask: boolean })[];
  todayTasks: Task[];
  eveningTasks: Task[];
  /** Today's blocks, in the user's zone, with the task's title when it has one. */
  blocks: TimelineBlock[];
  blockByTask: ReadonlyMap<string, TimelineBlock>;
  /** Today's timed meetings with their titles; the capacity's busy intervals stay the geometry, these only name them. */
  meetings: TimelineMeeting[];
  repo: TaskRepo;
  /** False until a calendar is connected: the ribbon offers to connect one (PRODUCT_SPEC.md §9.4). */
  calendarConnected: boolean;
  /** The one line above the ribbon when an account needs attention (SCREENS.md §2.7). */
  calendarIssue: CalendarIssue | null;
}

export function useToday(now: Temporal.Instant): TodayModel {
  const db = useLocalDatabase();
  const repo = useMemo(() => new TaskRepo(db), [db]);

  const { data: settingsRows } = useQuery<UserSettingsRow>(SETTINGS_SQL);
  const settings = settingsRows?.[0] ? toSettings(settingsRows[0]) : null;
  const today = todayFor({ timezone: settings?.timezone ?? "UTC", dayRolloverHour: settings?.dayRolloverHour ?? 4 }, now);
  const [from, to] = dayWindowParams(today);
  const todayIso = today.toString();

  const { data: workRows } = useQuery<WorkHoursRow>(WORK_HOURS_SQL);
  const { data: taskRows, isLoading } = useQuery<TaskRow>(TASKS_THROUGH_TODAY_SQL, [todayIso, todayIso]);
  const { data: blockRows } = useQuery<TimeBlockRow>(BLOCKS_AROUND_SQL, [from, to]);
  // The calendar mirror is month-bucketed on the server (§3.5); the query keeps a
  // subscription to the months around today alive for as long as Today is open.
  const { data: eventRows } = useQuery<CalendarEventRow>(EVENTS_AROUND_SQL, [from, to], {
    streams: [{ name: "calendar_window", parameters: { months: monthsAround(today) }, ttl: 60 * 60 * 24 }],
  });
  const { data: calendarRows } = useQuery<CalendarFullRow>(CALENDARS_FULL_SQL);
  const { data: connectionRows } = useQuery<CalendarConnectionRow>(CALENDAR_CONNECTIONS_SQL);

  return useMemo(() => {
    const tasks = (taskRows ?? []).map(toTask);
    const carried = settings ? carriedOver(tasks, today).map((t) => ({ ...t, ask: shouldAsk(t, settings) })) : [];
    const carriedIds = new Set(carried.map((t) => t.id));
    const onDay = tasks.filter((t) => !carriedIds.has(t.id) && t.doDate?.equals(today));
    const readByCalendar = new Map((calendarRows ?? []).map((c) => [c.id, c.read !== 0]));

    const capacity = settings
      ? capacityFor({
          day: today,
          settings: { timezone: settings.timezone, bufferPct: settings.bufferPct, defaultEstimateMin: settings.defaultEstimateMin },
          workHours: (workRows ?? []).map(toWorkWindow).filter((w): w is NonNullable<typeof w> => w !== null),
          events: (eventRows ?? []).map((e) => toCapacityEvent(e, readByCalendar.get(e.calendar_id ?? "") ?? true)),
          blocks: (blockRows ?? []).map(toCapacityBlock).filter((b): b is NonNullable<typeof b> => b !== null),
          tasks: (taskRows ?? []).map(toCapacityTask),
          now,
        })
      : null;

    const titles = new Map(tasks.map((t) => [t.id, t.title]));
    const zone = settings?.timezone ?? "UTC";
    const blocks: TimelineBlock[] = (blockRows ?? [])
      .map((r): TimelineBlock | null => {
        const b = toCapacityBlock(r);
        if (!b) return null;
        const start = b.startAt.toZonedDateTimeISO(zone);
        const end = b.endAt.toZonedDateTimeISO(zone);
        if (!start.toPlainDate().equals(today)) return null;
        return {
          id: b.id,
          taskId: b.taskId,
          title: r.title ?? (b.taskId ? (titles.get(b.taskId) ?? "Block") : "Block"),
          start: start.hour * 60 + start.minute,
          end: end.toPlainDate().equals(today) ? end.hour * 60 + end.minute : 24 * 60,
          locked: r.locked === 1,
        };
      })
      .filter((b): b is TimelineBlock => b !== null)
      .sort((a, b) => a.start - b.start);
    const blockByTask = new Map<string, TimelineBlock>(blocks.filter((b) => b.taskId).map((b) => [b.taskId as string, b]));
    // PRODUCT_SPEC.md §10.3 rule 7: a private calendar shows its events as "Busy"; a calendar switched off does not show at all.
    const privateIds = new Set((calendarRows ?? []).filter((c) => c.private === 1).map((c) => c.id));
    const meetings: TimelineMeeting[] = (eventRows ?? [])
      .map((e): TimelineMeeting | null => {
        if (e.all_day || !e.start_at || !e.end_at) return null;
        if (e.calendar_id && readByCalendar.get(e.calendar_id) === false) return null;
        const start = instant(normaliseTimestamp(e.start_at)).toZonedDateTimeISO(zone);
        const end = instant(normaliseTimestamp(e.end_at)).toZonedDateTimeISO(zone);
        if (!start.toPlainDate().equals(today)) return null;
        const hidden = e.calendar_id ? privateIds.has(e.calendar_id) : false;
        return {
          start: start.hour * 60 + start.minute,
          end: end.toPlainDate().equals(today) ? end.hour * 60 + end.minute : 24 * 60,
          title: hidden || !e.summary ? "Busy" : e.summary,
        };
      })
      .filter((m): m is TimelineMeeting => m !== null);

    return {
      ready: !isLoading && settings !== null,
      today,
      settings,
      capacity,
      carried,
      todayTasks: onDay.filter((t) => !t.evening),
      eveningTasks: onDay.filter((t) => t.evening),
      blocks,
      blockByTask,
      meetings,
      repo,
      // PRODUCT_SPEC.md §9.4: the ribbon says so when no calendar is connected; SCREENS.md §2.7: one line when the calendar has a problem.
      calendarConnected: (calendarRows ?? []).length > 0,
      calendarIssue: calendarIssueFrom(connectionRows ?? []),
    };
  }, [taskRows, blockRows, eventRows, calendarRows, connectionRows, workRows, settings, today, now, isLoading, repo]);
}

export interface CalendarIssue {
  kind: "reauth" | "error";
  message: string;
}

/** The first account that needs attention: lapsed access first, then a sync that failed (its events are still the last good ones). */
export function calendarIssueFrom(rows: readonly CalendarConnectionRow[]): CalendarIssue | null {
  const reauth = rows.find((r) => r.status === "needs_reauth" || r.status === "revoked");
  if (reauth) return { kind: "reauth", message: `Google Calendar${reauth.email ? ` (${reauth.email})` : ""} needs reconnecting.` };
  const failed = rows.find((r) => r.last_error);
  if (failed) return { kind: "error", message: failed.last_synced_at ? `Couldn't reach Google Calendar. Showing your last sync from ${new Date(failed.last_synced_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.` : "Couldn't reach Google Calendar yet." };
  return null;
}
