// The Week tab on the phone (the web's Upcoming; ANDROID_APP_SPEC.md §10, step 4), wired to the phone's own database.
// Everything it knows is the web app's own code, used as it is: the statements the web's page reads, the week's
// window and readouts (features/upcoming/week.ts), the days built from the rows (agenda.ts), what lies past the week
// (later.ts), the capacity engine behind every bar (use-week-capacity.ts), quick add behind the + buttons
// (quick-add/quick-add.tsx) and the repository that writes. The drawing is week-view.tsx.
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { compareDates, localDate } from "@/core/time";
import type { Task } from "@/core/types";
import { toTask } from "@/data/mappers";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { PLANNED_AFTER_SQL, PLANNED_BETWEEN_SQL, STARTING_LATER_SQL, UNPLANNED_SQL } from "@/data/queries/views";
import { DUE_FROM_SQL, WEEK_START_SQL } from "@/data/queries/week";
import type { TaskRow } from "@/data/schema.client";
import { dayPart } from "@/features/looks/look";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useWorkingSetSynced } from "@/features/shell/use-working-set";
import { moveToDay } from "@/features/tasks/move-to-day";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { capacityRange, laterReadout, nextSevenDays, nothingAhead, rangeTitle, weekDays } from "@/features/upcoming/agenda";
import { laterGroups } from "@/features/upcoming/later";
import { useWeekCapacity } from "@/features/upcoming/use-week-capacity";
import { clampOffset, weekTotalLine, weekWindow, type DayReadout } from "@/features/upcoming/week";
import { Fab } from "~/ui/fab";
import { Icon } from "~/ui/icon";
import { useColours } from "~/ui/theme";
import { useQuickAdd } from "../quick-add/quick-add";
import { Rows, useBreakDown } from "../rows/rows";
import { useWeekMode } from "./use-week-mode";
import { WeekView } from "./week-view";

export function Week() {
  const c = useColours();
  const router = useRouter();
  const repo = useTaskRepo();
  const db = useLocalDatabase();
  const now = useNow();
  const { today, settings, zone } = useLocalDay(now);
  const synced = useWorkingSetSynced();
  const todayIso = today.toString();
  const { data: weekStartRows } = useQuery<{ week_start: number | null }>(WEEK_START_SQL);
  const weekStart = weekStartRows?.[0]?.week_start ?? 0;
  const [mode, setMode] = useWeekMode();
  const [offset, setOffset] = useState(0);
  const windowDays = useMemo(() => weekWindow(localDate(todayIso), mode, weekStart, offset), [todayIso, mode, weekStart, offset]);
  const first = windowDays[0];
  const last = windowDays[windowDays.length - 1];
  const [from, to] = [first.toString(), last.toString()];

  // The statements the web's Upcoming reads, with its own parameters.
  const { data: planned } = useQuery<TaskRow>(PLANNED_BETWEEN_SQL, [from, to]);
  const { data: unplannedRows } = useQuery<TaskRow>(UNPLANNED_SQL, [todayIso]);
  const { data: laterRows } = useQuery<TaskRow>(PLANNED_AFTER_SQL, [to, todayIso]);
  const { data: startingRows } = useQuery<TaskRow>(STARTING_LATER_SQL, [todayIso]);
  const { data: dueRows } = useQuery<TaskRow>(DUE_FROM_SQL, [compareDates(first, today) < 0 ? from : todayIso]);
  const projectNames = useProjectNames();

  const starting = useMemo(() => (startingRows ?? []).map(toTask), [startingRows]);
  const due = useMemo(() => (dueRows ?? []).map(toTask), [dueRows]);
  const unplanned = useMemo(() => (unplannedRows ?? []).map(toTask), [unplannedRows]);
  const plannedTasks = useMemo(() => (planned ?? []).map(toTask), [planned]);
  const laterTasks = useMemo(() => (laterRows ?? []).map(toTask), [laterRows]);
  const later = useMemo(() => laterGroups(laterTasks, starting, today, last, due), [laterTasks, starting, today, last, due]);

  // Capacity: the week's days from today on, and every day out to day 14 for the agenda's readouts.
  const { from: capFrom, to: capTo } = capacityRange(first, last, today);
  const capacity = useWeekCapacity({ from: capFrom, to: capTo, today, now, settings });
  const days = useMemo(() => weekDays(windowDays, today, plannedTasks, starting, due, capacity.byDay), [plannedTasks, starting, due, windowDays, today, capacity]);
  const totalLine = capacity.byDay.size > 0 ? weekTotalLine(days.filter((d) => !d.past).map((d) => d.readout), offset === 0) : null;
  const nextDays = useMemo(() => nextSevenDays(today, capacity.byDay), [today, capacity]);
  const laterReadouts = useMemo(() => {
    const out = new Map<string, DayReadout>();
    for (const g of later)
      for (const d of g.days) {
        const readout = laterReadout(capacity.byDay, d.day, today);
        if (readout) out.set(d.day.toString(), readout);
      }
    return out;
  }, [later, capacity, today]);

  const loaded = planned !== undefined && unplannedRows !== undefined && laterRows !== undefined && startingRows !== undefined;
  const waiting = loaded && !synced && plannedTasks.length === 0 && unplanned.length === 0 && later.length === 0;
  // "Nothing scheduled beyond today." (SCREENS.md §21): no day after today has anything, here or further on.
  const noneAhead = loaded && synced && offset === 0 && later.length === 0 && nothingAhead(days);

  // The + buttons: a day's "+ Add" opens quick add on that day (a line that names no day of its own is for it); the
  // screen's own + is plain capture, as on the web.
  const quickAdd = useQuickAdd();
  const breakDown = useBreakDown();
  // The repository records the undo; the toast with Undo is the app's one (ui/undo-provider.tsx).
  const complete = (task: Task) => void repo.complete(task.id);

  return (
    <Rows tab>
      <WeekView
        part={dayPart(now.toZonedDateTimeISO(zone).hour)}
        eyebrow={mode === "calendar" ? "Upcoming · calendar week" : "Upcoming · rolling 7 days"}
        title={rangeTitle(first, last, today)}
        totalLine={totalLine}
        mode={mode}
        offset={offset}
        today={today}
        days={days}
        later={later}
        laterReadouts={laterReadouts}
        unplanned={unplanned}
        nextDays={nextDays}
        projectNames={projectNames}
        defaultEstimateMin={settings?.defaultEstimateMin ?? 30}
        waiting={waiting}
        noneAhead={noneAhead}
        onMode={(m) => {
          setMode(m);
          setOffset(0);
        }}
        onStep={(delta) => setOffset((o) => clampOffset(o + delta))}
        onThisWeek={() => setOffset(0)}
        onComplete={complete}
        onOpen={(task) => router.push(`/task/${task.id}`)}
        onMove={(task, to) => void (to === "someday" ? repo.setState(task.id, "someday") : repo.reschedule(task.id, to === "today" ? today : today.add({ days: 1 })))}
        onBreakDown={(task) => breakDown(task.id)}
        // Today on that day; today itself is plain Today, as the web addresses it (features/today/day-address.ts).
        onOpenDay={(day) => router.push(day.equals(today) ? "/" : `/?day=${day.toString()}`)}
        onAdd={(day) => quickAdd.open(day ? { day } : undefined)}
        onPlace={(task, day) => void moveToDay(db, repo, task.id, day)}
        bottomRoom={88}
      />
      <Fab label="Add a task" onPress={() => quickAdd.open()} />
    </Rows>
  );
}

const styles = StyleSheet.create({
});
