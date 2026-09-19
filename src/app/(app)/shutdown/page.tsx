"use client";
// The evening shutdown (SCREENS.md §15), wired to the day: what got done,
// what didn't, tomorrow's shape, and the day_plans row it writes.
import { useRouter } from "next/navigation";
import { Loading } from "../loading-view";
import { useMemo } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { capacityFor } from "@/core/capacity";
import { Temporal } from "@/core/time";
import { toCapacityBlock, toCapacityEvent, toCapacityTask, toTask, toWorkWindow } from "@/data/mappers";
import { BLOCKS_AROUND_SQL, CALENDARS_SQL, EVENTS_AROUND_SQL, TASKS_THROUGH_TODAY_SQL, WORK_HOURS_SQL, dayWindowParams } from "@/data/queries/today";
import { DAY_PLAN_SQL, DONE_BETWEEN_SQL, PLANNED_BETWEEN_SQL, dayRangeParams, monthsBack } from "@/data/queries/views";
import { DayPlanRepo } from "@/data/repositories/day-plan-repo";
import type { CalendarEventRow, TaskRow as TaskRowType, TimeBlockRow, WorkHoursRow } from "@/data/schema.client";
import { ShutdownFlow, type CarryChoice } from "@/features/rituals/shutdown-flow";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskRepo } from "@/features/tasks/use-task-repo";

const USER_SQL = `select id, personal_space_id from users limit 1`;

interface DayPlanRow {
  id: string;
  shutdown_at: string | null;
  highlights: string | null;
  day_rating: number | null;
}

export default function ShutdownPage() {
  const router = useRouter();
  const db = useLocalDatabase();
  const tasks = useTaskRepo();
  const dayPlans = useMemo(() => new DayPlanRepo(db), [db]);
  const now = useNow();
  const { today, zone, settings } = useLocalDay(now);
  const tomorrow = today.add({ days: 1 });
  const todayIso = today.toString();

  // The local day as instants, for "completed today".
  const [dayStart, dayEnd] = useMemo(() => {
    const start = today.toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from("00:00") }).toInstant().toString();
    const end = tomorrow.toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from("00:00") }).toInstant().toString();
    return [start, end];
  }, [today, tomorrow, zone]);
  const months = useMemo(() => monthsBack(today, 1), [today]);

  const { data: users } = useQuery<{ id: string; personal_space_id: string | null }>(USER_SQL);
  const { data: doneRows } = useQuery<TaskRowType>(DONE_BETWEEN_SQL, [dayStart, dayEnd], { streams: [{ name: "logbook", parameters: { months }, ttl: 60 * 60 }] });
  const { data: openRows } = useQuery<TaskRowType>(TASKS_THROUGH_TODAY_SQL, [todayIso, todayIso]);
  const { data: planRows } = useQuery<DayPlanRow>(DAY_PLAN_SQL, [todayIso]);
  const { data: tomorrowRows } = useQuery<TaskRowType>(PLANNED_BETWEEN_SQL, dayRangeParams(tomorrow, 1));
  const { data: workRows } = useQuery<WorkHoursRow>(WORK_HOURS_SQL);
  const [tFrom, tTo] = dayWindowParams(tomorrow);
  const { data: eventRows } = useQuery<CalendarEventRow>(EVENTS_AROUND_SQL, [tFrom, tTo]);
  const { data: blockRows } = useQuery<TimeBlockRow>(BLOCKS_AROUND_SQL, [tFrom, tTo]);
  const { data: calendarRows } = useQuery<{ id: string; read: number | null }>(CALENDARS_SQL);

  const done = useMemo(() => (doneRows ?? []).map(toTask), [doneRows]);
  const unfinished = useMemo(() => (openRows ?? []).map(toTask).filter((t) => !t.evening), [openRows]);
  const plan = planRows?.[0] ?? null;

  const tomorrowSpare = useMemo(() => {
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

  const user = users?.[0];
  const ctx = user?.personal_space_id ? { spaceId: user.personal_space_id, userId: user.id } : null;
  const write = (patch: Parameters<DayPlanRepo["upsert"]>[2]) => {
    if (ctx) void dayPlans.upsert(todayIso, ctx, patch);
  };
  const carry = (id: string, to: CarryChoice) => {
    if (to === "tomorrow") void tasks.reschedule(id, tomorrow);
    else if (to === "someday") void tasks.setState(id, "someday");
    else void tasks.setState(id, "dropped");
  };

  if (!settings) return <Loading />;

  return (
    <ShutdownFlow
      done={done}
      unfinished={unfinished}
      defaultEstimateMin={settings.defaultEstimateMin}
      rating={plan?.day_rating ?? null}
      highlight={plan?.highlights ?? ""}
      tomorrow={{ spareMin: tomorrowSpare, planned: (tomorrowRows ?? []).length }}
      onCarry={carry}
      onCarryAll={() => unfinished.forEach((t) => void tasks.reschedule(t.id, tomorrow))}
      onRating={(r) => write({ dayRating: r })}
      onHighlight={(text) => write({ highlights: text || null })}
      onPlanTomorrow={() => router.push(`/upcoming`)}
      onClose={() => {
        write({ shutdownAt: new Date().toISOString() });
        router.push("/today");
      }}
      onSkip={() => router.push("/today")}
    />
  );
}
