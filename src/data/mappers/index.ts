// The only place a SQLite row (text/integer) becomes a domain value
// (LocalDate, LocalTime, boolean). Engines never see raw rows.
import type { CapacityBlock, CapacityEvent, CapacityTask, WorkWindow } from "@/core/capacity";
import { instant, localDate, localTime, type Instant, type LocalDate, type LocalTime } from "@/core/time";
import type { ChecklistItem, Heading, MissPolicy, Priority, Project, ProjectId, ProjectState, RecurrenceMode, SpaceId, Task, TaskId, TaskState } from "@/core/types";
import type { CalendarEventRow, HeadingRow, ProjectRow, TaskRow, TimeBlockRow, UserSettingsRow, WorkHoursRow } from "../schema.client";

const bool = (v: number | null | undefined): boolean => v === 1;
const date = (v: string | null | undefined): LocalDate | null => (v ? localDate(v.slice(0, 10)) : null);
const time = (v: string | null | undefined): LocalTime | null => (v ? localTime(v.slice(0, 5)) : null);
const ts = (v: string | null | undefined): Instant | null => (v ? instant(normaliseTimestamp(v)) : null);

/** Postgres timestamptz arrives as "2026-09-15 08:41:00+00"; Temporal wants ISO. */
export function normaliseTimestamp(v: string): string {
  let s = v.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) s = `${s}:00`;
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(s)) s = `${s}Z`;
  return s;
}

export function toProject(r: ProjectRow): Project {
  return {
    id: r.id as ProjectId,
    spaceId: (r.space_id ?? "") as SpaceId,
    areaId: r.area_id ?? null,
    name: r.name ?? "Untitled project",
    notes: r.notes_md ?? null,
    state: (r.state ?? "active") as ProjectState,
    deadline: date(r.deadline),
    sortKey: r.sort_key ?? "",
  };
}

export function toHeading(r: HeadingRow): Heading {
  return { id: r.id, projectId: (r.project_id ?? "") as ProjectId, title: r.title ?? "", sortKey: r.sort_key ?? "" };
}

export function toChecklistItem(r: { id: string; task_id: string | null; title: string | null; done: number | null; sort_key: string | null }): ChecklistItem {
  return { id: r.id, taskId: (r.task_id ?? "") as TaskId, title: r.title ?? "", done: r.done === 1, sortKey: r.sort_key ?? "" };
}

export function toTask(r: TaskRow): Task {
  return {
    id: r.id as TaskId,
    spaceId: (r.space_id ?? "") as SpaceId,
    projectId: (r.project_id as Task["projectId"]) ?? null,
    headingId: r.heading_id ?? null,
    title: r.title ?? "",
    notes: r.notes_md ?? null,
    state: (r.state ?? "inbox") as TaskState,
    priority: (r.priority ?? 0) as Priority,
    doDate: date(r.do_date),
    doTime: time(r.do_time),
    deadline: date(r.deadline),
    startDate: date(r.start_date),
    evening: bool(r.evening),
    estimateMin: r.estimate_min ?? null,
    carryCount: r.carry_count ?? 0,
    lastCarriedAt: date(r.last_carried_at),
    lastTouchedAt: ts(r.last_touched_at) ?? instant("1970-01-01T00:00:00Z"),
    missPolicy: (r.miss_policy ?? "carry") as MissPolicy,
    recurrenceRule: r.recurrence_rule ?? null,
    recurrenceMode: (r.recurrence_mode as RecurrenceMode | null) ?? null,
    recurrenceSeriesId: (r.recurrence_series_id as TaskId | null) ?? null,
    recurrencePausedUntil: date(r.recurrence_paused_until),
    sortKey: r.sort_key ?? "",
    daySortKey: r.day_sort_key ?? null,
    routineRunId: r.routine_run_id ?? null,
  };
}

export function toCapacityTask(r: TaskRow): CapacityTask {
  return {
    id: r.id as TaskId,
    state: (r.state ?? "inbox") as TaskState,
    doDate: date(r.do_date),
    estimateMin: r.estimate_min ?? null,
    evening: bool(r.evening),
    daySortKey: r.day_sort_key ?? null,
  };
}

export function toCapacityBlock(r: TimeBlockRow): CapacityBlock | null {
  const startAt = ts(r.start_at);
  const endAt = ts(r.end_at);
  if (!startAt || !endAt) return null;
  return { id: r.id, taskId: (r.task_id as TaskId | null) ?? null, startAt, endAt };
}

export function toCapacityEvent(r: CalendarEventRow, calendarRead: boolean): CapacityEvent {
  return {
    id: r.id,
    startAt: ts(r.start_at),
    endAt: ts(r.end_at),
    startDate: date(r.start_date),
    endDate: date(r.end_date),
    allDay: bool(r.all_day),
    busy: r.busy == null ? true : bool(r.busy),
    status: (r.status as CapacityEvent["status"]) ?? null,
    selfResponse: (r.self_response as CapacityEvent["selfResponse"]) ?? null,
    eventType: (r.event_type as CapacityEvent["eventType"]) ?? null,
    isOurs: bool(r.is_ours),
    calendarRead,
  };
}

/** Postgres weekday 0 = Monday → ISO 1 = Monday. */
export function toWorkWindow(r: WorkHoursRow): WorkWindow | null {
  if (r.weekday == null || !r.start_time || !r.end_time) return null;
  return { weekday: r.weekday + 1, start: localTime(r.start_time.slice(0, 5)), end: localTime(r.end_time.slice(0, 5)) };
}

export interface Settings {
  timezone: string;
  dayRolloverHour: number;
  bufferPct: number;
  defaultEstimateMin: number;
  /** The longest and shortest block Plan my day makes (SYSTEM_DESIGN.md §5.5). */
  maxBlockMin: number;
  minBlockMin: number;
  carryAskAfter: number;
  autoSomedayDays: number;
  eveningStartsAt: LocalTime;
  /** Offer the morning review of carried-over tasks on the first open of a new day (on by default; null before the column has synced). */
  carryReview: boolean;
}

export function toSettings(r: UserSettingsRow): Settings {
  return {
    timezone: r.timezone ?? "UTC",
    dayRolloverHour: r.day_rollover_hour ?? 4,
    bufferPct: r.buffer_pct ?? 15,
    defaultEstimateMin: r.default_estimate_min ?? 30,
    maxBlockMin: r.max_block_min ?? 90,
    minBlockMin: r.min_block_min ?? 25,
    carryAskAfter: r.carry_ask_after ?? 3,
    autoSomedayDays: r.auto_someday_days ?? 30,
    eveningStartsAt: localTime((r.evening_starts_at ?? "18:00").slice(0, 5)),
    carryReview: r.carry_review == null ? true : bool(r.carry_review),
  };
}
