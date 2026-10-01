// From the Today model to the scheduler's input (SYSTEM_DESIGN.md §5.5):
// the candidates are every open task Today shows (carried over, today, this
// evening), the blocks are the day's blocks with their source and lock, and
// the days ahead feed deadline pressure. Pure, so it is tested without a
// database.
import { minuteOnDay } from "@/features/today/day-minute";
import { capacityFor, type CapacityBlock, type CapacityEvent, type WorkWindow } from "@/core/capacity";
import type { AheadDay, PlanBlock, PlanInput, PlanTask } from "@/core/planning";
import { compareDates, toInstant, timeFromMinutes, type Instant, type LocalDate, type Zone } from "@/core/time";
import type { Task } from "@/core/types";
import type { Settings } from "@/data/mappers";
import type { TimelineBlock, TodayModel } from "@/features/today/hooks/use-today";

/** Deadline pressure looks at most this far ahead; beyond it a deadline is calm whatever the work. */
export const AHEAD_DAYS = 14;

export type PlanModel = Pick<TodayModel, "today" | "settings" | "capacity" | "carried" | "todayTasks" | "eveningTasks" | "blocks">;

export function planTask(t: Task, createdAt: LocalDate | null): PlanTask {
  return {
    id: t.id,
    title: t.title,
    priority: t.priority,
    doDate: t.doDate,
    doTime: t.doTime,
    deadline: t.deadline,
    startDate: t.startDate,
    evening: t.evening,
    estimateMin: t.estimateMin,
    carryCount: t.carryCount,
    createdAt,
    sortKey: t.sortKey,
    daySortKey: t.daySortKey,
  };
}

export function planBlock(b: TimelineBlock): PlanBlock {
  return { id: b.id, taskId: b.taskId, start: b.start, end: b.end, locked: b.locked, source: b.source ?? null };
}

/** The open tasks a plan considers, in the order Today lists them. */
export function candidateTasks(model: Pick<PlanModel, "carried" | "todayTasks" | "eveningTasks">): Task[] {
  return [...model.carried, ...model.todayTasks, ...model.eveningTasks];
}

/** The scheduler's input for today, or null while settings or capacity are still loading. */
export function planInputFrom(model: PlanModel, opts: { now: Instant; ages?: ReadonlyMap<string, LocalDate>; ahead?: readonly AheadDay[] }): PlanInput | null {
  const { settings, capacity } = model;
  if (!settings || !capacity) return null;
  // Completing a task marks its block done (PRODUCT_SPEC.md §10.2): what has passed stays as it was, the rest is free again.
  const nowMin = minuteOnDay(opts.now, settings.timezone, model.today).minute;
  const blocks = model.blocks.flatMap((b) => (!b.done ? [planBlock(b)] : b.start < nowMin ? [{ ...planBlock(b), end: Math.min(b.end, nowMin) }] : []));
  return {
    day: model.today,
    capacity: { windows: capacity.windows, busy: capacity.busy },
    blocks,
    candidates: candidateTasks(model).map((t) => planTask(t, opts.ages?.get(t.id) ?? null)),
    settings: {
      timezone: settings.timezone,
      maxBlockMin: settings.maxBlockMin,
      minBlockMin: settings.minBlockMin,
      defaultEstimateMin: settings.defaultEstimateMin,
      eveningStartsAt: settings.eveningStartsAt,
      bufferPct: settings.bufferPct,
    },
    now: opts.now,
    ahead: opts.ahead,
  };
}

/** The last day deadline pressure needs: the latest deadline after today, capped at AHEAD_DAYS; null when no task has one. */
export function aheadThrough(today: LocalDate, tasks: readonly Pick<Task, "deadline">[]): LocalDate | null {
  const cap = today.add({ days: AHEAD_DAYS });
  let last: LocalDate | null = null;
  for (const t of tasks) {
    if (!t.deadline || compareDates(t.deadline, today) <= 0) continue;
    const d = compareDates(t.deadline, cap) > 0 ? cap : t.deadline;
    if (!last || compareDates(d, last) > 0) last = d;
  }
  return last;
}

/**
 * Each day after `today` through `through`, from the capacity engine: its
 * working minutes and what is free once meetings, blocks and the buffer are out.
 */
export function aheadDays(args: {
  today: LocalDate;
  through: LocalDate;
  settings: Pick<Settings, "timezone" | "bufferPct" | "defaultEstimateMin">;
  workHours: readonly WorkWindow[];
  events: readonly CapacityEvent[];
  blocks: readonly CapacityBlock[];
}): AheadDay[] {
  const out: AheadDay[] = [];
  for (let day = args.today.add({ days: 1 }); compareDates(day, args.through) <= 0; day = day.add({ days: 1 })) {
    const c = capacityFor({
      day,
      settings: { timezone: args.settings.timezone, bufferPct: args.settings.bufferPct, defaultEstimateMin: args.settings.defaultEstimateMin },
      workHours: args.workHours,
      events: args.events,
      blocks: args.blocks,
      tasks: [],
    });
    out.push({ day, workMin: c.workMin, freeMin: c.state === "no_work_day" ? 0 : Math.max(0, c.workMin - c.busyMin - c.bufferMin - c.committedMin) });
  }
  return out;
}

/** A minute of `day` as the ISO instant a block row stores; 1440 is the next midnight. */
export function isoAt(day: LocalDate, minute: number, zone: Zone): string {
  return minute >= 24 * 60 ? toInstant(day.add({ days: 1 }), timeFromMinutes(0), zone).toString() : toInstant(day, timeFromMinutes(minute), zone).toString();
}
