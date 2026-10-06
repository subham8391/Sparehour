// The day's real numbers for a notification (SCREENS.md §19), computed at
// send time from `public.push_day_context` with the same engine Today uses
// (src/core/capacity), so "5h 40m fits today" matches the ribbon. Pure: the
// rows in, the figures out.
import { capacityFor, countsAsBusy, workWindowsFor, type CapacityBlock, type CapacityEvent, type CapacityTask, type WorkWindow } from "@/core/capacity";
import { compareDates, instant, localDate, localTime, type Instant, type LocalDate, type Zone } from "@/core/time";
import type { TaskId, TaskState } from "@/core/types";

/** What `public.push_day_context(user)` returns (migration 20261006101100). */
export interface DayContext {
  day: string;
  timezone: string;
  buffer_pct: number;
  default_estimate_min: number;
  app_badge: number;
  calendar_connected: boolean;
  work_hours: { weekday: number; start_time: string; end_time: string }[];
  events: {
    id: string;
    start_at: string | null;
    end_at: string | null;
    start_date: string | null;
    end_date: string | null;
    all_day: boolean;
    busy: boolean;
    status: string | null;
    self_response: string | null;
    event_type: string | null;
    is_ours: boolean;
    calendar_read: boolean;
  }[];
  blocks: { id: string; task_id: string | null; start_at: string; end_at: string }[];
  tasks: { id: string; state: string; do_date: string | null; estimate_min: number | null; evening: boolean; day_sort_key: string | null }[];
  done: number;
}

export interface DayFigures {
  /** The app-icon badge: today's remaining count, 0 after shutdown or with the badge off. */
  badge: number;
  hasCalendar: boolean;
  /** The day has working hours (and is not wholly out of office). */
  workDay: boolean;
  /** Work − meetings − buffer, before anything planned (PRODUCT_SPEC.md §9.1; M1 gap rulings "fits today"). */
  capacityMin: number;
  /** Timed meetings that count as busy and fall in working hours. */
  meetings: number;
  /** What the ribbon calls spare: capacity less blocks and planned estimates. */
  spareMin: number;
  /** Tasks finished that day. */
  done: number;
}

const ts = (v: string | null) => (v ? instant(v.replace(" ", "T")) : null);
const day = (v: string | null) => (v ? localDate(v.slice(0, 10)) : null);

function events(ctx: DayContext): CapacityEvent[] {
  return ctx.events.map((e) => ({
    id: e.id,
    startAt: ts(e.start_at),
    endAt: ts(e.end_at),
    startDate: day(e.start_date),
    endDate: day(e.end_date),
    allDay: e.all_day,
    busy: e.busy,
    status: (e.status as CapacityEvent["status"]) ?? null,
    selfResponse: (e.self_response as CapacityEvent["selfResponse"]) ?? null,
    eventType: (e.event_type as CapacityEvent["eventType"]) ?? null,
    isOurs: e.is_ours,
    calendarRead: e.calendar_read,
  }));
}

/** Minutes of `on` the instant falls at in the zone, clamped to the day. */
function minuteOn(i: Instant, on: LocalDate, zone: Zone): number {
  const z = i.toZonedDateTimeISO(zone);
  const c = compareDates(z.toPlainDate(), on);
  if (c < 0) return 0;
  if (c > 0) return 1440;
  return z.hour * 60 + z.minute;
}

export function dayFigures(ctx: DayContext): DayFigures {
  const d = localDate(ctx.day);
  const zone = ctx.timezone;
  const workHours: WorkWindow[] = ctx.work_hours.map((w) => ({ weekday: w.weekday + 1, start: localTime(w.start_time.slice(0, 5)), end: localTime(w.end_time.slice(0, 5)) }));
  const evs = events(ctx);
  const blocks: CapacityBlock[] = ctx.blocks.map((b) => ({ id: b.id, taskId: (b.task_id as TaskId | null) ?? null, startAt: instant(b.start_at.replace(" ", "T")), endAt: instant(b.end_at.replace(" ", "T")) }));
  const tasks: CapacityTask[] = ctx.tasks.map((t) => ({ id: t.id as TaskId, state: t.state as TaskState, doDate: day(t.do_date), estimateMin: t.estimate_min, evening: t.evening, daySortKey: t.day_sort_key }));
  const c = capacityFor({ day: d, settings: { timezone: zone, bufferPct: ctx.buffer_pct, defaultEstimateMin: ctx.default_estimate_min }, workHours, events: evs, blocks, tasks });

  const windows = workWindowsFor(d, workHours);
  const meetings = evs.filter((e) => {
    if (e.allDay || !e.startAt || !e.endAt || !countsAsBusy(e)) return false;
    const start = minuteOn(e.startAt, d, zone);
    const end = minuteOn(e.endAt, d, zone);
    return end > start && windows.some((w) => start < w.end && end > w.start);
  }).length;

  return {
    badge: Math.max(0, ctx.app_badge ?? 0),
    hasCalendar: ctx.calendar_connected,
    workDay: c.state !== "no_work_day",
    capacityMin: Math.max(0, c.workMin - c.busyMin - c.bufferMin),
    meetings,
    spareMin: c.spareMin,
    done: ctx.done ?? 0,
  };
}
