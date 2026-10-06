"use client";
// Capacity for a run of days (SCREENS.md §3 "Capacity bar", §6 readouts out to
// day 14): the one capacity engine over each day's work hours, meetings,
// blocks and planned tasks, read from the local database so it works offline.
// Today's day is computed exactly as Today computes it — the same rows, the
// same `now`, the same finished-task block rule — so the week's today column
// and Today's hero never disagree. A drag in progress can be previewed: the
// task is counted on the day it hovers over and on no other.
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { capacityFor, type Capacity, type CapacityBlock, type CapacityEvent, type CapacitySettings, type CapacityTask, type WorkWindow } from "@/core/capacity";
import type { Instant, LocalDate } from "@/core/time";
import { toCapacityBlock, toCapacityEvent, toCapacityTask, toWorkWindow, type Settings } from "@/data/mappers";
import { BLOCKS_AROUND_SQL, CALENDARS_SQL, EVENTS_AROUND_SQL, WORK_HOURS_SQL, monthsAround } from "@/data/queries/today";
import { monthsBack } from "@/data/queries/views";
import { DAY_LOAD_SQL } from "@/data/queries/week";
import type { CalendarEventRow, TaskRow, TimeBlockRow, WorkHoursRow } from "@/data/schema.client";
import { BLOCK_TASKS_SQL, capacityBlocks, type BlockTask } from "@/features/today/hooks/use-today";

export interface WeekCapacityInput {
  days: readonly LocalDate[];
  today: LocalDate;
  now: Instant;
  settings: CapacitySettings;
  workHours: readonly WorkWindow[];
  events: readonly CapacityEvent[];
  /** Already past `capacityBlocks`: a finished task's block keeps only the time it used. */
  blocks: readonly CapacityBlock[];
  tasks: readonly CapacityTask[];
  /** A row in the air: the task as it would be where it hovers (`doDate` null over "Not yet planned"). */
  preview?: CapacityTask | null;
}

/** Each day's capacity, keyed by its ISO date. Only today's gets `now`, as on Today. */
export function weekCapacities(input: WeekCapacityInput): Map<string, Capacity> {
  const { preview } = input;
  // A task that leaves its day lets go of the time it held there (TaskRepo.placeInDay), so the preview does too.
  const tasks = preview ? [...input.tasks.filter((t) => t.id !== preview.id), ...(preview.doDate ? [preview] : [])] : input.tasks;
  const blocks = preview ? input.blocks.filter((b) => b.taskId !== preview.id) : input.blocks;
  const out = new Map<string, Capacity>();
  for (const day of input.days) {
    out.set(
      day.toString(),
      capacityFor({ day, settings: input.settings, workHours: input.workHours, events: input.events, blocks, tasks, now: day.equals(input.today) ? input.now : undefined }),
    );
  }
  return out;
}

/**
 * The calendar mirror's months for a range (the `calendar_window` stream is keyed by month). A range inside the
 * months Today already asks for asks for exactly those, so the two views share one subscription.
 */
export function calendarMonths(today: LocalDate, from: LocalDate, to: LocalDate): string[] {
  const around = monthsAround(today);
  const first = from.subtract({ days: 1 }).toPlainYearMonth();
  const last = to.add({ days: 1 }).toPlainYearMonth();
  const months: string[] = [];
  for (let m = first; m.toString() <= last.toString(); m = m.add({ months: 1 })) months.push(m.toString());
  return months.every((m) => around.includes(m)) ? around : months;
}

export interface WeekCapacity {
  /** Capacity by ISO day; empty until the settings row is here. */
  byDay: ReadonlyMap<string, Capacity>;
}

/** Capacity for every day from `from` to `to`, inclusive. */
export function useWeekCapacity({
  from,
  to,
  today,
  now,
  settings,
  preview = null,
}: {
  from: LocalDate;
  to: LocalDate;
  today: LocalDate;
  now: Instant;
  settings: Settings | null;
  preview?: CapacityTask | null;
}): WeekCapacity {
  const fromIso = from.toString();
  const toIso = to.toString();
  const around: [string, string] = [from.subtract({ days: 1 }).toString(), to.add({ days: 1 }).toString()];
  const { data: taskRows } = useQuery<TaskRow>(DAY_LOAD_SQL, [fromIso, toIso]);
  const { data: workRows } = useQuery<WorkHoursRow>(WORK_HOURS_SQL);
  const months = useMemo(() => calendarMonths(today, from, to), [today, from, to]);
  const { data: eventRows } = useQuery<CalendarEventRow>(EVENTS_AROUND_SQL, around, {
    streams: [{ name: "calendar_window", parameters: { months }, ttl: 60 * 60 * 24 }],
  });
  const { data: blockRows } = useQuery<TimeBlockRow>(BLOCKS_AROUND_SQL, around);
  const { data: calendarRows } = useQuery<{ id: string; read: number | null }>(CALENDARS_SQL);
  // The same subscription Today keeps, so a block whose task was just finished frees the rest of its time here too.
  const doneMonths = useMemo(() => monthsBack(today, 1), [today]);
  const { data: blockTaskRows } = useQuery<{ id: string; title: string | null; state: string | null }>(BLOCK_TASKS_SQL, around, {
    streams: [{ name: "logbook", parameters: { months: doneMonths }, ttl: 60 * 60 }],
  });

  const byDay = useMemo(() => {
    if (!settings) return new Map<string, Capacity>();
    const days: LocalDate[] = [];
    for (let d = from; d.toString() <= toIso; d = d.add({ days: 1 })) days.push(d);
    const readByCalendar = new Map((calendarRows ?? []).map((c) => [c.id, c.read !== 0]));
    const blockTasks = new Map<string, BlockTask>((blockTaskRows ?? []).map((r) => [r.id, { title: r.title, state: r.state }]));
    for (const r of taskRows ?? []) if (!blockTasks.has(r.id)) blockTasks.set(r.id, { title: r.title ?? null, state: r.state ?? null });
    return weekCapacities({
      days,
      today,
      now,
      settings: { timezone: settings.timezone, bufferPct: settings.bufferPct, defaultEstimateMin: settings.defaultEstimateMin },
      workHours: (workRows ?? []).map(toWorkWindow).filter((w): w is WorkWindow => w !== null),
      events: (eventRows ?? []).map((e) => toCapacityEvent(e, readByCalendar.get(e.calendar_id ?? "") ?? true)),
      blocks: capacityBlocks(
        (blockRows ?? []).map(toCapacityBlock).filter((b): b is CapacityBlock => b !== null),
        blockTasks,
        now,
      ),
      tasks: (taskRows ?? []).map(toCapacityTask),
      preview,
    });
  }, [settings, from, toIso, today, now, calendarRows, blockTaskRows, taskRows, workRows, eventRows, blockRows, preview]);

  return { byDay };
}
