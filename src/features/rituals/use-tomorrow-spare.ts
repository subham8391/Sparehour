"use client";
// Tomorrow's spare time, for the rituals' "tomorrow" lines: the capacity
// engine over tomorrow's work hours, meetings, blocks and planned tasks.
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { capacityFor } from "@/core/capacity";
import type { LocalDate } from "@/core/time";
import { toCapacityBlock, toCapacityEvent, toCapacityTask, toWorkWindow, type Settings } from "@/data/mappers";
import { BLOCKS_AROUND_SQL, CALENDARS_SQL, EVENTS_AROUND_SQL, WORK_HOURS_SQL, dayWindowParams } from "@/data/queries/today";
import { PLANNED_BETWEEN_SQL, dayRangeParams } from "@/data/queries/views";
import type { CalendarEventRow, TaskRow as TaskRowType, TimeBlockRow, WorkHoursRow } from "@/data/schema.client";

export function useTomorrowSpare(tomorrow: LocalDate, settings: Settings | null): { spareMin: number | null; planned: number } {
  const { data: tomorrowRows } = useQuery<TaskRowType>(PLANNED_BETWEEN_SQL, dayRangeParams(tomorrow, 1));
  const { data: workRows } = useQuery<WorkHoursRow>(WORK_HOURS_SQL);
  const [from, to] = dayWindowParams(tomorrow);
  const { data: eventRows } = useQuery<CalendarEventRow>(EVENTS_AROUND_SQL, [from, to]);
  const { data: blockRows } = useQuery<TimeBlockRow>(BLOCKS_AROUND_SQL, [from, to]);
  const { data: calendarRows } = useQuery<{ id: string; read: number | null }>(CALENDARS_SQL);

  const spareMin = useMemo(() => {
    if (!settings) return null;
    const readByCalendar = new Map((calendarRows ?? []).map((c) => [c.id, c.read !== 0]));
    const cap = capacityFor({
      day: tomorrow,
      settings: { timezone: settings.timezone, bufferPct: settings.bufferPct, defaultEstimateMin: settings.defaultEstimateMin },
      workHours: (workRows ?? []).map(toWorkWindow).filter((w): w is NonNullable<typeof w> => w !== null),
      events: (eventRows ?? []).map((e) => toCapacityEvent(e, readByCalendar.get(e.calendar_id ?? "") ?? true)),
      blocks: (blockRows ?? []).map(toCapacityBlock).filter((b): b is NonNullable<typeof b> => b !== null),
      tasks: (tomorrowRows ?? []).map(toCapacityTask),
    });
    return cap.state === "no_work_day" ? null : cap.spareMin;
  }, [settings, tomorrow, workRows, eventRows, blockRows, tomorrowRows, calendarRows]);

  return { spareMin, planned: (tomorrowRows ?? []).length };
}
