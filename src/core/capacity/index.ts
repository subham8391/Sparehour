// Capacity & spare-time calculator. See docs/engineering/SYSTEM_DESIGN.md §5.4.
//
//   spare  = work − busy − buffer − committed − unscheduled
//   buffer = min(round5(buffer_pct% × work), work − busy)
//
// Everything is computed in wall-clock minutes of the given day in the user's
// zone, so a 9-hour workday is 540 minutes even on a DST-change day.
import { compareDates, minutesOfDay, timeFromMinutes, type Instant, type LocalDate, type LocalTime, type Zone } from "../time";
import type { TaskId, TaskState } from "../types";
import { clip, merge, round5, subtract, totalMinutes, type Interval } from "./intervals";

export type { Interval } from "./intervals";

export interface WorkWindow {
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
  start: LocalTime;
  end: LocalTime;
}

export interface CapacityEvent {
  id: string;
  startAt: Instant | null;
  endAt: Instant | null;
  startDate: LocalDate | null;
  /** Exclusive, as Google reports it. */
  endDate: LocalDate | null;
  allDay: boolean;
  /** transparency = opaque */
  busy: boolean;
  status: "confirmed" | "tentative" | "cancelled" | null;
  selfResponse: "accepted" | "declined" | "tentative" | "needsAction" | null;
  eventType: "default" | "outOfOffice" | "focusTime" | "workingLocation" | "birthday" | null;
  /** Our own time block echoed back by the calendar — counted as committed, not busy. */
  isOurs: boolean;
  /** The per-calendar "include in capacity" toggle. */
  calendarRead: boolean;
}

export interface CapacityBlock {
  id: string;
  taskId: TaskId | null;
  startAt: Instant;
  endAt: Instant;
}

export interface CapacityTask {
  id: TaskId;
  state: TaskState;
  doDate: LocalDate | null;
  estimateMin: number | null;
  evening: boolean;
  daySortKey: string | null;
}

export interface CapacitySettings {
  timezone: Zone;
  bufferPct: number;
  defaultEstimateMin: number;
}

export interface CapacityInput {
  day: LocalDate;
  settings: CapacitySettings;
  workHours: readonly WorkWindow[];
  events: readonly CapacityEvent[];
  blocks: readonly CapacityBlock[];
  tasks: readonly CapacityTask[];
  /** Needed for the projected finish; omit for a day other than today. */
  now?: Instant;
}

export type CapacityState = "no_work_day" | "comfortable" | "full" | "tight" | "overloaded";

export interface Capacity {
  day: LocalDate;
  state: CapacityState;
  /** Why there is no capacity on a no_work_day. */
  reason: "no_hours" | "out_of_office" | null;
  workMin: number;
  busyMin: number;
  bufferMin: number;
  committedMin: number;
  unscheduledMin: number;
  spareMin: number;
  /** `max(0, −spare)` — the number the "more than fits" sentence names. */
  overMin: number;
  /** Time planned for this evening; kept out of the daytime maths. */
  eveningMin: number;
  /** Block time that lies outside working hours — planned, but not capacity. */
  outsideHoursMin: number;
  /** Unanswered invitations counted as busy; the UI hatches these. */
  unansweredMin: number;
  /** All-day events that were not subtracted, for the day header. */
  allDayNotes: string[];
  /** Work windows, meetings and blocks as minutes of the day, for drawing the ribbon. */
  windows: Interval[];
  busy: Interval[];
  blocks: Interval[];
  /** Genuinely open time: windows − busy − blocks. */
  free: Interval[];
  projectedFinish: LocalTime | null;
  /** Work that cannot finish inside today's windows ("~1h 20m spills over"). */
  overflowMin: number;
}

const DAY = 1440;

/** Where an instant falls on `day`, in wall-clock minutes; clamped to [0, 1440]. */
function minuteOn(i: Instant, day: LocalDate, zone: Zone): number {
  const z = i.toZonedDateTimeISO(zone);
  const c = compareDates(z.toPlainDate(), day);
  if (c < 0) return 0;
  if (c > 0) return DAY;
  return z.hour * 60 + z.minute;
}

function intervalOn(startAt: Instant, endAt: Instant, day: LocalDate, zone: Zone): Interval | null {
  const start = minuteOn(startAt, day, zone);
  const end = minuteOn(endAt, day, zone);
  return end > start ? { start, end } : null;
}

function coversDay(e: CapacityEvent, day: LocalDate): boolean {
  if (!e.startDate) return false;
  const end = e.endDate ?? e.startDate.add({ days: 1 });
  return compareDates(e.startDate, day) <= 0 && compareDates(day, end) < 0;
}

/** The calendar-event classification table from §5.4. */
export function countsAsBusy(e: CapacityEvent): boolean {
  if (!e.calendarRead || e.isOurs || !e.busy) return false;
  if (e.status === "cancelled") return false;
  if (e.selfResponse === "declined") return false;
  if (e.eventType === "workingLocation" || e.eventType === "birthday") return false;
  if (e.allDay) return false; // never 8 hours of work; outOfOffice is handled separately
  return true;
}

export function workWindowsFor(day: LocalDate, workHours: readonly WorkWindow[]): Interval[] {
  return merge(
    workHours
      .filter((w) => w.weekday === day.dayOfWeek)
      .map((w) => ({ start: minutesOfDay(w.start), end: minutesOfDay(w.end) })),
  );
}

export function classify(spareMin: number, workMin: number): CapacityState {
  if (workMin <= 0) return "no_work_day";
  if (spareMin >= 0.25 * workMin) return "comfortable";
  if (spareMin >= 0) return "full";
  if (spareMin >= -0.1 * workMin) return "tight";
  return "overloaded";
}

const noWorkDay = (day: LocalDate, reason: "no_hours" | "out_of_office", extra: Partial<Capacity> = {}): Capacity => ({
  day,
  state: "no_work_day",
  reason,
  workMin: 0,
  busyMin: 0,
  bufferMin: 0,
  committedMin: 0,
  unscheduledMin: 0,
  spareMin: 0,
  overMin: 0,
  eveningMin: 0,
  outsideHoursMin: 0,
  unansweredMin: 0,
  allDayNotes: [],
  windows: [],
  busy: [],
  blocks: [],
  free: [],
  projectedFinish: null,
  overflowMin: 0,
  ...extra,
});

export function capacityFor(input: CapacityInput): Capacity {
  const { day, settings, events, blocks, tasks } = input;
  const zone = settings.timezone;

  let windows = workWindowsFor(day, input.workHours);
  const allDayNotes: string[] = [];
  const oooIntervals: Interval[] = [];
  const rawBusy: Interval[] = [];
  const unanswered: Interval[] = [];

  for (const e of events) {
    if (!e.calendarRead || e.isOurs || e.status === "cancelled" || e.selfResponse === "declined") continue;
    if (e.eventType === "outOfOffice") {
      if (e.allDay ? coversDay(e, day) : e.startAt && e.endAt) {
        if (e.allDay) oooIntervals.push({ start: 0, end: DAY });
        else {
          const iv = intervalOn(e.startAt!, e.endAt!, day, zone);
          if (iv) oooIntervals.push(iv);
        }
      }
      continue;
    }
    if (e.allDay) {
      if (coversDay(e, day)) allDayNotes.push(e.id);
      continue;
    }
    if (!countsAsBusy(e) || !e.startAt || !e.endAt) continue;
    const iv = intervalOn(e.startAt, e.endAt, day, zone);
    if (!iv) continue;
    rawBusy.push(iv);
    if (e.selfResponse === "needsAction") unanswered.push(iv);
  }

  if (windows.length === 0) return noWorkDay(day, "no_hours", { allDayNotes });
  if (oooIntervals.length) {
    windows = subtract(windows, oooIntervals);
    if (windows.length === 0) return noWorkDay(day, "out_of_office", { allDayNotes });
  }

  const workMin = totalMinutes(windows);
  const busy = clip(merge(rawBusy), windows);
  const busyMin = totalMinutes(busy);
  const unansweredMin = totalMinutes(clip(unanswered, windows));
  const free = subtract(windows, busy);

  const dayBlocks: Interval[] = [];
  const blockedTaskIds = new Set<string>();
  for (const b of blocks) {
    const iv = intervalOn(b.startAt, b.endAt, day, zone);
    if (!iv) continue;
    dayBlocks.push(iv);
    if (b.taskId) blockedTaskIds.add(b.taskId);
  }
  const mergedBlocks = merge(dayBlocks);
  const committedBlocks = clip(mergedBlocks, free);
  const committedMin = totalMinutes(committedBlocks);
  const outsideHoursMin = totalMinutes(mergedBlocks) - totalMinutes(clip(mergedBlocks, windows));

  let unscheduledMin = 0;
  let eveningMin = 0;
  const unscheduledTasks: CapacityTask[] = [];
  for (const t of tasks) {
    if (!t.doDate || !t.doDate.equals(day)) continue;
    if (t.state !== "inbox" && t.state !== "active") continue;
    const est = t.estimateMin ?? settings.defaultEstimateMin;
    if (blockedTaskIds.has(t.id)) continue; // its block is already committed time, evening or not
    if (t.evening) {
      eveningMin += est;
      continue;
    }
    unscheduledMin += est;
    unscheduledTasks.push(t);
  }

  const bufferMin = Math.max(0, Math.min(round5((workMin * settings.bufferPct) / 100), workMin - busyMin));
  const spareMin = workMin - busyMin - bufferMin - committedMin - unscheduledMin;

  const { projectedFinish, overflowMin } = projectFinish({
    windows,
    fixed: merge([...busy, ...committedBlocks]),
    blocksAfterCursor: committedBlocks,
    unscheduledMin,
    cursor: input.now ? Math.max(minuteOn(input.now, day, zone), windows[0].start) : windows[0].start,
    hasWork: unscheduledTasks.length > 0 || committedBlocks.length > 0,
  });

  return {
    day,
    state: classify(spareMin, workMin),
    reason: null,
    workMin,
    busyMin,
    bufferMin,
    committedMin,
    unscheduledMin,
    spareMin,
    overMin: Math.max(0, -spareMin),
    eveningMin,
    outsideHoursMin,
    unansweredMin,
    allDayNotes,
    windows,
    busy,
    blocks: committedBlocks,
    free: subtract(free, committedBlocks),
    projectedFinish,
    overflowMin,
  };
}

/**
 * "At this pace you're done at 16:25." Unscheduled work is poured into the
 * gaps after `cursor` (around meetings and blocks); the answer is the later of
 * when that runs out and when the last block ends.
 */
function projectFinish(p: {
  windows: Interval[];
  fixed: Interval[];
  blocksAfterCursor: Interval[];
  unscheduledMin: number;
  cursor: number;
  hasWork: boolean;
}): { projectedFinish: LocalTime | null; overflowMin: number } {
  if (!p.hasWork) return { projectedFinish: null, overflowMin: 0 };
  let remaining = p.unscheduledMin;
  let finish = p.cursor;
  for (const gap of subtract(p.windows, p.fixed)) {
    if (remaining <= 0) break;
    const start = Math.max(gap.start, p.cursor);
    if (gap.end <= start) continue;
    const take = Math.min(gap.end - start, remaining);
    remaining -= take;
    finish = start + take;
  }
  const lastBlockEnd = p.blocksAfterCursor.reduce((m, b) => (b.end > p.cursor ? Math.max(m, b.end) : m), 0);
  finish = Math.max(finish, lastBlockEnd);
  if (remaining > 0) return { projectedFinish: null, overflowMin: remaining };
  return { projectedFinish: timeFromMinutes(finish), overflowMin: 0 };
}
