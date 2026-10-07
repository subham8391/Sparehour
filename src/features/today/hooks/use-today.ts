"use client";
// Composes the local data with the core engines: capacity, carried-over and
// today's list, all reactive to the local database.
import { useCallback, useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { capacityFor, eveningBudget, type Capacity, type CapacityBlock, type EveningBudget } from "@/core/capacity";
import { carriedOver } from "@/core/rollover/carried"; // not the index: that carries the recurrence engine (§11.6)
import { Temporal, instant, localDate, todayFor, type Instant, type LocalDate } from "@/core/time";
import type { Task, TaskId } from "@/core/types";
import { normaliseTimestamp, toCapacityBlock, toCapacityEvent, toCapacityTask, toSettings, toTask, toWorkWindow, type Settings } from "@/data/mappers";
import { BLOCKS_AROUND_SQL, EVENTS_AROUND_SQL, SETTINGS_SQL, TASKS_THROUGH_TODAY_SQL, WORK_HOURS_SQL, dayWindowParams, monthsAround } from "@/data/queries/today";
import { monthsBack } from "@/data/queries/shell";
import { CALENDARS_FULL_SQL, CALENDAR_CONNECTIONS_SQL, type CalendarConnectionRow, type CalendarFullRow } from "@/data/queries/calendar";
import type { TaskRepo } from "@/data/repositories/task-repo";
import { useCarryAsks } from "@/features/rollover/use-carry-asks";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import type { CalendarEventRow, TaskRow, TimeBlockRow, UserSettingsRow, WorkHoursRow } from "@/data/schema.client";

/** A block as the timeline draws it: minutes of the local day. */
export interface TimelineBlock {
  id: string;
  taskId: TaskId | null;
  title: string;
  start: number;
  end: number;
  locked: boolean;
  /** time_blocks.source: 'manual', 'plan', … Plan my day replaces only its own unlocked blocks. */
  source?: string | null;
  /** Its task is done, or no longer open (parked, dropped): the block is done too (PRODUCT_SPEC.md §10.2). A block without a task never is. */
  done?: boolean;
}

/**
 * The tasks today's blocks belong to, in any state, so a block knows when its task is finished. A completed task
 * leaves the device once it syncs unless the logbook stream holds it, so the query keeps this month's subscribed.
 */
export const BLOCK_TASKS_SQL = `
  select id, title, state from tasks
  where deleted_at is null
    and id in (select task_id from time_blocks where deleted_at is null and task_id is not null and substr(start_at, 1, 10) between ? and ?)`;

/** What a block needs to know about its task. */
export interface BlockTask {
  title: string | null;
  state: string | null;
}

/** Open means the person can still work on it: inbox or active. Done, Someday, dropped and archived tasks are not. */
function isClosed(t: BlockTask | undefined): boolean {
  const state = t?.state;
  return Boolean(state) && state !== "inbox" && state !== "active";
}

/** Today's blocks as the timeline draws them, in the user's zone, titled from the block or its task and marked done with it. */
export function timelineBlocks(rows: readonly TimeBlockRow[], tasks: ReadonlyMap<string, BlockTask>, zone: string, today: LocalDate): TimelineBlock[] {
  return rows
    .map((r): TimelineBlock | null => {
      const b = toCapacityBlock(r);
      if (!b) return null;
      const start = b.startAt.toZonedDateTimeISO(zone);
      const end = b.endAt.toZonedDateTimeISO(zone);
      if (!start.toPlainDate().equals(today)) return null;
      const task = b.taskId ? tasks.get(b.taskId) : undefined;
      return {
        id: b.id,
        taskId: b.taskId,
        title: r.title ?? (b.taskId ? (task?.title ?? "Block") : "Block"),
        start: start.hour * 60 + start.minute,
        end: end.toPlainDate().equals(today) ? end.hour * 60 + end.minute : 24 * 60,
        locked: r.locked === 1,
        source: r.source ?? null,
        done: isClosed(task),
      };
    })
    .filter((b): b is TimelineBlock => b !== null)
    .sort((a, b) => a.start - b.start);
}

/**
 * The blocks capacity counts. Completing a task marks its block done (PRODUCT_SPEC.md §10.2), so a closed task's
 * block keeps only the part already behind `now` — that time was spent — and what it had not reached is free
 * again, so the hero gives it back. Blocks without a task, and blocks of open tasks, count as they are.
 */
export function capacityBlocks(blocks: readonly CapacityBlock[], tasks: ReadonlyMap<string, BlockTask>, now: Instant): CapacityBlock[] {
  return blocks.flatMap((b) => {
    if (!b.taskId || !isClosed(tasks.get(b.taskId))) return [b];
    if (Temporal.Instant.compare(b.startAt, now) >= 0) return [];
    if (Temporal.Instant.compare(b.endAt, now) <= 0) return [b];
    return [{ ...b, endAt: now }];
  });
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
  /** The settings row, for Today's own preferences (⋯ Sort, Show completed). */
  settingsId: string | null;
  /** Asks shown now that are new today, and how a screen that shows them records them (`useRecordAsks`). */
  freshAsks: readonly string[];
  markAsked: (ids: readonly string[], at: string) => Promise<void>;
  capacity: Capacity | null;
  carried: (Task & { ask: boolean })[];
  todayTasks: Task[];
  eveningTasks: Task[];
  /** This Evening's own budget, from the end of the working day to the cut-off (PRODUCT_SPEC.md §9.1); null before the settings. */
  evening: EveningBudget | null;
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
  // The undoable repo: everything done on Today answers ⌘Z and shows its toast, like every other list (FEATURES.md §8).
  const repo = useTaskRepo();

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
  // The same subscription the closed day's summary takes, so a task completed here stays on the device to say its block is done.
  const months = useMemo(() => monthsBack(localDate(todayIso), 1), [todayIso]);
  const { data: blockTaskRows } = useQuery<{ id: string; title: string | null; state: string | null }>(BLOCK_TASKS_SQL, [from, to], {
    streams: [{ name: "logbook", parameters: { months }, ttl: 60 * 60 }],
  });

  const tasks = useMemo(() => (taskRows ?? []).map(toTask), [taskRows]);
  const hasSettings = settings !== null;
  const carriedTasks = useMemo(() => (hasSettings ? carriedOver(tasks, today) : []), [hasSettings, tasks, today]);
  // At most two asks a day, once per task per seven days (PRODUCT_SPEC.md §8.3.4); the screen that shows them records them.
  const { asks, fresh: freshAsks } = useCarryAsks(carriedTasks, { carryAskAfter: settings?.carryAskAfter ?? null, today, zone: settings?.timezone ?? "UTC", now });
  const markAsked = useCallback((ids: readonly string[], at: string) => repo.markAsked(ids, at), [repo]);

  return useMemo(() => {
    const carried = carriedTasks.map((t) => ({ ...t, ask: asks.has(t.id) }));
    const carriedIds = new Set(carried.map((t) => t.id));
    const onDay = tasks.filter((t) => !carriedIds.has(t.id) && t.doDate?.equals(today));
    const readByCalendar = new Map((calendarRows ?? []).map((c) => [c.id, c.read !== 0]));
    // Each block's task: the open ones from the list at once, then every state (done included) once its query lands.
    const blockTasks = new Map<string, BlockTask>(tasks.map((t) => [t.id, { title: t.title, state: t.state }]));
    for (const r of blockTaskRows ?? []) blockTasks.set(r.id, { title: r.title, state: r.state });

    const workHours = (workRows ?? []).map(toWorkWindow).filter((w): w is NonNullable<typeof w> => w !== null);
    const capacity = settings
      ? capacityFor({
          day: today,
          settings: { timezone: settings.timezone, bufferPct: settings.bufferPct, defaultEstimateMin: settings.defaultEstimateMin },
          workHours,
          events: (eventRows ?? []).map((e) => toCapacityEvent(e, readByCalendar.get(e.calendar_id ?? "") ?? true)),
          blocks: capacityBlocks(
            (blockRows ?? []).map(toCapacityBlock).filter((b): b is NonNullable<typeof b> => b !== null),
            blockTasks,
            now,
          ),
          tasks: (taskRows ?? []).map(toCapacityTask),
          now,
        })
      : null;

    const zone = settings?.timezone ?? "UTC";
    const blocks = timelineBlocks(blockRows ?? [], blockTasks, zone, today);
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

    const eveningTasks = onDay.filter((t) => t.evening);
    const evening = settings
      ? eveningBudget({
          day: today,
          workHours,
          eveningStartsAt: settings.eveningStartsAt,
          eveningEndsAt: settings.eveningEndsAt,
          plannedMin: eveningTasks.reduce((sum, t) => sum + (t.estimateMin ?? settings.defaultEstimateMin), 0),
        })
      : null;

    return {
      ready: !isLoading && settings !== null,
      today,
      settings,
      settingsId: settingsRows?.[0]?.id ?? null,
      freshAsks,
      markAsked,
      capacity,
      carried,
      todayTasks: onDay.filter((t) => !t.evening),
      eveningTasks,
      evening,
      blocks,
      blockByTask,
      meetings,
      repo,
      // PRODUCT_SPEC.md §9.4: the ribbon says so when no calendar is connected; SCREENS.md §2.7: one line when the calendar has a problem.
      calendarConnected: (calendarRows ?? []).length > 0,
      calendarIssue: calendarIssueFrom(connectionRows ?? []),
    };
  }, [tasks, carriedTasks, asks, freshAsks, markAsked, settingsRows, taskRows, blockRows, blockTaskRows, eventRows, calendarRows, connectionRows, workRows, settings, today, now, isLoading, repo]);
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
