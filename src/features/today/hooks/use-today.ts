"use client";
// Composes the local data with the core engines: capacity, carried-over and
// today's list, all reactive to the local database.
import { useCallback, useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { capacityFor, type Capacity, type CapacityBlock } from "@/core/capacity";
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
  /** time_blocks.push_state, the server's word on Google: 'pending' and 'failed' are still to be written. */
  pushState?: string | null;
  /** The mark the timeline draws (SCREENS.md §2.7, §21): "will sync" while a change waits, "not synced" while blocking is off. */
  sync?: "will" | "off" | null;
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
        pushState: r.push_state ?? null,
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
  /** An invitation not yet answered: still busy, drawn hatched (SYSTEM_DESIGN.md §5.4). */
  unanswered?: boolean;
}

/**
 * Blocks whose event Google deleted while their task was open (time_blocks.notice, server-owned): soft-deleted, so
 * no other query sees them, and streamed until the task row has said "Block removed in Google Calendar" once.
 */
export const REMOVED_BLOCKS_SQL = `select id, task_id from time_blocks where deleted_at is not null and notice = 'removed_in_google' and task_id is not null`;

/** Whether new blocks can reach Google, and why blocking is paused when it cannot (PRODUCT_SPEC.md §10.3 rule 5). */
export interface CalendarWrites {
  /** A write calendar is set and its account may write: a block's pending push_state means it will sync. */
  on: boolean;
  /** Blocking is paused, and this says why; null while blocking works. */
  off: string | null;
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
  /** Today's blocks, in the user's zone, with the task's title when it has one. */
  blocks: TimelineBlock[];
  /** Each task's blocks today, earliest first: a task may have several (PRODUCT_SPEC.md §10.2 "Multiple blocks per task"). */
  blocksByTask: ReadonlyMap<string, readonly TimelineBlock[]>;
  /** Today's timed meetings with their titles; the capacity's busy intervals stay the geometry, these only name them. */
  meetings: TimelineMeeting[];
  repo: TaskRepo;
  /** False until a calendar is connected: the ribbon offers to connect one (PRODUCT_SPEC.md §9.4). */
  calendarConnected: boolean;
  /** The one line above the ribbon when an account needs attention (SCREENS.md §2.7). */
  calendarIssue: CalendarIssue | null;
  /** Whether blocks reach Google, and whether blocking is paused (access revoked, write calendar gone). */
  writes: CalendarWrites;
  /** Today's all-day events, by title, for the line under the date (SYSTEM_DESIGN.md §5.4: flagged, never busy). */
  allDay: string[];
  /** Each task's blocks that Google removed, for the row's one quiet note (PRODUCT_SPEC.md §10.3 rule 3). */
  removedBlocks: ReadonlyMap<string, readonly string[]>;
  /** A calendar is connected but this window of its events has not arrived yet (SCREENS.md §21 Loading). */
  calendarLoading: boolean;
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
  const { data: removedRows } = useQuery<{ id: string; task_id: string }>(REMOVED_BLOCKS_SQL);
  // Has this window of the calendar arrived at least once? The same subscription, held until it has synced.
  const { isLoading: calendarWaiting } = useQuery<{ n: number }>(CALENDAR_ARRIVED_SQL, [], {
    streams: [{ name: "calendar_window", parameters: { months: monthsAround(today) }, ttl: 60 * 60 * 24, waitForStream: true }],
  });
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

    const capacity = settings
      ? capacityFor({
          day: today,
          settings: { timezone: settings.timezone, bufferPct: settings.bufferPct, defaultEstimateMin: settings.defaultEstimateMin },
          workHours: (workRows ?? []).map(toWorkWindow).filter((w): w is NonNullable<typeof w> => w !== null),
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
    const blocksByTask = new Map<string, TimelineBlock[]>();
    for (const b of blocks) if (b.taskId) blocksByTask.set(b.taskId, [...(blocksByTask.get(b.taskId) ?? []), b]);
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
          unanswered: e.self_response === "needsAction",
        };
      })
      .filter((m): m is TimelineMeeting => m !== null);
    const removedBlocks = new Map<string, string[]>();
    for (const r of removedRows ?? []) removedBlocks.set(r.task_id, [...(removedBlocks.get(r.task_id) ?? []), r.id]);
    const connected = (calendarRows ?? []).length > 0;

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
      eveningTasks: onDay.filter((t) => t.evening),
      blocks,
      blocksByTask,
      meetings,
      repo,
      // PRODUCT_SPEC.md §9.4: the ribbon says so when no calendar is connected; SCREENS.md §2.7: one line when the calendar has a problem.
      calendarConnected: connected,
      calendarIssue: calendarIssueFrom(connectionRows ?? [], calendarRows ?? []),
      writes: calendarWrites(connectionRows ?? [], calendarRows ?? []),
      allDay: allDayTitles(eventRows ?? [], today, readByCalendar, privateIds),
      removedBlocks,
      calendarLoading: connected && calendarWaiting,
    };
  }, [tasks, carriedTasks, asks, freshAsks, markAsked, settingsRows, taskRows, blockRows, blockTaskRows, eventRows, calendarRows, connectionRows, removedRows, calendarWaiting, workRows, settings, today, now, isLoading, repo]);
}

/** A cheap row for the calendar window's subscription to wait on; its loading state is "not arrived yet". */
const CALENDAR_ARRIVED_SQL = `select 1 as n`;

export interface CalendarIssue {
  /** reauth: access lapsed or revoked; write_gone: the calendar blocks went to left Google; error: a sync failed. */
  kind: "reauth" | "write_gone" | "error";
  message: string;
  /** The account, and the moment the issue began, so a dismissal for the session is of this issue only. */
  key: string;
  /** Blocking is paused until it is fixed (PRODUCT_SPEC.md §10.3 rule 5); an unreachable calendar never pauses it. */
  blocking: boolean;
}

type CalendarLink = Pick<CalendarFullRow, "calendar_account_id" | "write_target">;

/** The account behind the write calendar, when there is one. */
const writeAccount = (calendars: readonly CalendarLink[]) => calendars.find((c) => c.write_target === 1)?.calendar_account_id ?? null;
const lapsed = (r: CalendarConnectionRow) => r.status === "needs_reauth" || r.status === "revoked";

/**
 * The first thing about the calendar that needs attention (SCREENS.md §2.7, §21): lapsed access first, then a write
 * calendar that left Google, then a sync that failed (its events are still the last good ones). Lapsed access
 * pauses blocking when it is the write calendar's account; a lost write calendar always does.
 */
export function calendarIssueFrom(rows: readonly CalendarConnectionRow[], calendars: readonly CalendarLink[] = []): CalendarIssue | null {
  const writer = writeAccount(calendars);
  const reauth = rows.find((r) => lapsed(r) && r.id === writer) ?? rows.find(lapsed);
  if (reauth) return { kind: "reauth", message: `Google Calendar${reauth.email ? ` (${reauth.email})` : ""} needs reconnecting.`, key: `reauth:${reauth.id}`, blocking: reauth.id === writer };
  const gone = writer === null ? rows.find((r) => r.write_lost_at) : undefined;
  if (gone) return { kind: "write_gone", message: "The calendar your blocks went to is no longer in Google Calendar.", key: `gone:${gone.id}:${gone.write_lost_at}`, blocking: true };
  const failed = rows.find((r) => r.last_error);
  if (failed)
    return {
      kind: "error",
      message: failed.last_synced_at ? `Couldn't reach Google Calendar. Showing your last sync from ${new Date(failed.last_synced_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.` : "Couldn't reach Google Calendar yet.",
      key: `error:${failed.id}:${failed.last_synced_at ?? ""}`,
      blocking: false,
    };
  return null;
}

/** Whether blocks reach Google now, and the plain-words reason blocking is paused when the issue pauses it. */
export function calendarWrites(rows: readonly CalendarConnectionRow[], calendars: readonly CalendarLink[]): CalendarWrites {
  const issue = calendarIssueFrom(rows, calendars);
  const writer = writeAccount(calendars);
  const account = writer ? rows.find((r) => r.id === writer) : undefined;
  return {
    on: Boolean(account && account.can_write === 1 && !lapsed(account)),
    off: issue?.blocking ? (issue.kind === "reauth" ? "Blocking is paused until Google Calendar is reconnected. Your blocks stay here, not synced." : "Blocking is paused until you choose where blocks go. Your blocks stay here, not synced.") : null,
  };
}

/** Today's all-day events by title (private calendars say "Busy"); out-of-office days have their own line on the ribbon. */
export function allDayTitles(rows: readonly CalendarEventRow[], today: LocalDate, readByCalendar: ReadonlyMap<string, boolean>, privateIds: ReadonlySet<string>): string[] {
  const day = today.toString();
  return rows
    .filter((e) => e.all_day && e.start_date && e.start_date <= day && day < (e.end_date ?? localDate(e.start_date).add({ days: 1 }).toString()))
    .filter((e) => e.status !== "cancelled" && e.self_response !== "declined" && e.event_type !== "outOfOffice")
    .filter((e) => !e.calendar_id || readByCalendar.get(e.calendar_id) !== false)
    .map((e) => (e.calendar_id && privateIds.has(e.calendar_id)) || !e.summary ? "Busy" : e.summary);
}
