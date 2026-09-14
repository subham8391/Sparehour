"use client";
// Composes the local data with the core engines: capacity, carried-over and
// today's list, all reactive to the local database.
import { useMemo } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { capacityFor, type Capacity } from "@/core/capacity";
import { carriedOver, shouldAsk } from "@/core/rollover/carried"; // not the index: that carries the recurrence engine (§11.6)
import { Temporal, todayFor, type LocalDate } from "@/core/time";
import type { Task, TaskId } from "@/core/types";
import { toCapacityBlock, toCapacityEvent, toCapacityTask, toSettings, toTask, toWorkWindow, type Settings } from "@/data/mappers";
import { BLOCKS_AROUND_SQL, CALENDARS_SQL, EVENTS_AROUND_SQL, SETTINGS_SQL, TASKS_THROUGH_TODAY_SQL, WORK_HOURS_SQL, dayWindowParams, monthsAround } from "@/data/queries/today";
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
  repo: TaskRepo;
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
  const { data: calendarRows } = useQuery<{ id: string; read: number | null }>(CALENDARS_SQL);

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
      repo,
    };
  }, [taskRows, blockRows, eventRows, calendarRows, workRows, settings, today, now, isLoading, repo]);
}
