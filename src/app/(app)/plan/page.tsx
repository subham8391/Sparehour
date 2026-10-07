"use client";
// The morning plan (SCREENS.md §14), wired to the day: the frame comes from
// the capacity engine, the picker's groups are frozen when the flow opens,
// every tick writes immediately, and Done stamps day_plans.planned_at.
import { useRouter } from "next/navigation";
import { Loading } from "../loading-view";
import { useMemo, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { useSyncChip } from "@/features/shell/use-sync-chip";
import { eveningStartMin } from "@/core/capacity/evening";
import type { Task } from "@/core/types";
import { toTask } from "@/data/mappers";
import { OPEN_TASKS_SQL } from "@/data/queries/views";
import { DayPlanRepo } from "@/data/repositories/day-plan-repo";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { candidates, fitsToday, onTodayTasks, type Candidates } from "@/features/rituals/morning-plan";
import { MorningPlanFlow } from "@/features/rituals/morning-plan-flow";
import { LazyPlanIsland, usePlanPreview } from "@/features/planning/use-plan-preview";
import { useTomorrowSpare } from "@/features/rituals/use-tomorrow-spare";
import { useNow } from "@/features/shell/use-local-day";
import { minuteOnDay } from "@/features/today/day-minute";
import { useToday } from "@/features/today/hooks/use-today";
import { useConvertToProject } from "@/features/tasks/use-convert";
import { usePlacing } from "@/features/blocking/use-placing";
import { useQuickAdd } from "@/features/quickadd/quick-add-provider";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { placerTimeline } from "@/features/today/day-pane";
import { useRecordAsks } from "@/features/rollover/use-carry-asks";

const USER_SQL = `select id, personal_space_id from users limit 1`;

export default function PlanPage() {
  const router = useRouter();
  const db = useLocalDatabase();
  const dayPlans = useMemo(() => new DayPlanRepo(db), [db]);
  const now = useNow();
  const model = useToday(now);
  // Recorded once step 2 is on screen, where the asks are (PRODUCT_SPEC.md §8.3.4).
  const [asksSeen, setAsksSeen] = useState(false);
  useRecordAsks(model.freshAsks, model.markAsked, asksSeen);
  // Step 2's asks are Today's: the same two a day, the same seven-day memory (PRODUCT_SPEC.md §8.3.4).
  const asks = useMemo(() => new Set(model.carried.filter((t) => t.ask).map((t) => t.id)), [model.carried]);
  const breakDown = useConvertToProject(model.repo);
  const detail = useTaskDetail();
  const quickAdd = useQuickAdd();
  const sync = useSyncChip();
  const tomorrow = model.today.add({ days: 1 });
  const { data: users } = useQuery<{ id: string; personal_space_id: string | null }>(USER_SQL);
  const { data: openRows, isLoading: loadingOpen } = useQuery<TaskRowType>(OPEN_TASKS_SQL);
  const open = useMemo(() => (openRows ?? []).map(toTask), [openRows]);
  const { spareMin: tomorrowSpareMin } = useTomorrowSpare(tomorrow, model.settings);
  // Step 3 offers Plan my day: the same preview as Today, inside the step (SCREENS.md §14).
  const planning = usePlanPreview();

  // Freeze the groups the first time data is there, so rows stay put while choices are made.
  // The query reports an empty list while it loads, so wait for it, or the picker freezes empty.
  const [frozen, setFrozen] = useState<Candidates | null>(null);
  // On a fresh device the query answers with nothing until the first sync lands, so wait for rows or a settled sync.
  const settled = sync.state !== "connecting" && sync.state !== "syncing";
  if (!frozen && !loadingOpen && model.ready && (open.length > 0 || settled)) setFrozen(candidates(open, model.today));
  const byId = useMemo(() => new Map(open.map((t) => [t.id, t])), [open]);
  const groups = useMemo<Candidates>(() => {
    const live = (list: Task[]) => list.map((t) => byId.get(t.id) ?? t).filter((t) => t.state === "inbox" || t.state === "active");
    const f = frozen ?? { carried: [], dueThisWeek: [], fromProjects: [] };
    return { carried: live(f.carried), dueThisWeek: live(f.dueThisWeek), fromProjects: live(f.fromProjects) };
  }, [byId, frozen]);
  // What Today lists: a task waiting for a later start date is not on today yet (TASKS_THROUGH_TODAY_SQL).
  const onToday = useMemo(() => onTodayTasks(open, model.today), [open, model.today]);

  // Step 2 starts from Today's spare figure: an ad-hoc block holds its time here as it does on Today.
  const cap = model.capacity;
  const pickedIds = new Set(onToday.filter((t) => !t.evening).map((t) => t.id));
  const zone = model.settings?.timezone ?? "UTC";
  const nowMin = minuteOnDay(now, zone, model.today).minute;
  const fitsMin = fitsToday(cap, model.blocks, pickedIds, nowMin);
  const user = users?.[0];
  // Step 3 blocks the picked tasks with Today's own placing (B, drags, taps, moves), registered for B while the plan is open.
  // Only what is picked for today: B on a row still waiting in step 2 does not block a task the day does not hold.
  const findTask = (id: string) => onToday.find((t) => t.id === id);
  const placer = usePlacing({
    day: model.today,
    zone,
    blocks: model.blocks,
    free: cap?.free ?? [],
    dayStart: cap?.windows[0]?.start ?? 9 * 60,
    dayEnd: cap?.windows[cap.windows.length - 1]?.end ?? 17 * 60,
    nowMinute: nowMin,
    defaultEstimateMin: model.settings?.defaultEstimateMin ?? 30,
    findTask,
  });

  if (!model.ready || !model.settings) return <Loading />;
  const settings = model.settings;

  return (
    <MorningPlanFlow
      meetings={model.meetings}
      blocks={model.blocks}
      capacity={cap}
      groups={groups}
      onToday={onToday}
      fitsMin={fitsMin}
      tomorrowSpareMin={tomorrowSpareMin}
      // Step 2's note names when the evening's own time starts: the end of the working day (PRODUCT_SPEC.md §9.1).
      eveningStartMin={eveningStartMin(cap?.windows ?? [], settings.eveningStartsAt)}
      defaultEstimateMin={settings.defaultEstimateMin}
      asks={asks}
      onAsksShown={() => setAsksSeen(true)}
      onBreakDown={(id) => void breakDown(id)}
      today={model.today}
      now={now}
      zone={settings.timezone}
      onPick={(task, picked) => {
        if (picked) {
          void model.repo.reschedule(task.id, model.today);
          return;
        }
        // Unticking puts the task back on the day it had when the plan opened (the frozen list keeps it): a carried
        // task is carried again. last_carried_at is no guide, because the rollover stamps it with today.
        const was = frozen && [...frozen.carried, ...frozen.dueThisWeek, ...frozen.fromProjects].find((t) => t.id === task.id);
        if (was?.doDate && !was.doDate.equals(model.today)) void model.repo.reschedule(task.id, was.doDate);
        else void model.repo.update(task.id, { doDate: null });
      }}
      onCarry={(id, to) => {
        if (to === "today") void model.repo.reschedule(id, model.today);
        else if (to === "tomorrow") void model.repo.reschedule(id, tomorrow);
        else void model.repo.setState(id, to === "someday" ? "someday" : "dropped");
      }}
      onMoveToTomorrow={(id) => void model.repo.reschedule(id, tomorrow)}
      onEstimate={(id, minutes) => void model.repo.update(id, { estimateMin: minutes })}
      onAddTask={() => quickAdd.open("today ")}
      blocking={{
        timeline: placerTimeline(placer, findTask, detail.open),
        placing: placer.placingTask ? { title: placer.placingTask.title, onCancel: () => placer.setPlacing(null) } : null,
        onPlace: placer.setPlacing,
      }}
      onDone={() => {
        if (user?.personal_space_id) void dayPlans.upsert(model.today.toString(), { spaceId: user.personal_space_id, userId: user.id }, { plannedAt: new Date().toISOString() });
        router.push("/today");
      }}
      onSkip={() => router.push("/today")}
      planMyDay={{
        open: planning.mode !== null,
        onOpen: () => planning.open("plan"),
        preview: planning.mode && <LazyPlanIsland mode={planning.mode} model={model} now={now} layout="inline" onDrawing={planning.setDrawing} onClose={planning.close} />,
        drawing: planning.drawing,
      }}
    />
  );
}
