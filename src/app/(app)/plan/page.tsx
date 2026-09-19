"use client";
// The morning plan (SCREENS.md §14), wired to the day: the frame comes from
// the capacity engine, the picker's groups are frozen when the flow opens,
// every tick writes immediately, and Done stamps day_plans.planned_at.
import { useRouter } from "next/navigation";
import { VIEW_COLUMN } from "@/features/shell/view-header";
import { cx } from "@/ui/cx";
import { useMemo, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { useSyncChip } from "@/features/shell/use-sync-chip";
import type { Task } from "@/core/types";
import { toTask } from "@/data/mappers";
import { OPEN_TASKS_SQL } from "@/data/queries/views";
import { DayPlanRepo } from "@/data/repositories/day-plan-repo";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { candidates, type Candidates } from "@/features/rituals/morning-plan";
import { MorningPlanFlow } from "@/features/rituals/morning-plan-flow";
import { useTomorrowSpare } from "@/features/rituals/use-tomorrow-spare";
import { useNow } from "@/features/shell/use-local-day";
import { useToday } from "@/features/today/hooks/use-today";

const USER_SQL = `select id, personal_space_id from users limit 1`;

export default function PlanPage() {
  const router = useRouter();
  const db = useLocalDatabase();
  const dayPlans = useMemo(() => new DayPlanRepo(db), [db]);
  const now = useNow();
  const model = useToday(now);
  const sync = useSyncChip();
  const tomorrow = model.today.add({ days: 1 });
  const { data: users } = useQuery<{ id: string; personal_space_id: string | null }>(USER_SQL);
  const { data: openRows, isLoading: loadingOpen } = useQuery<TaskRowType>(OPEN_TASKS_SQL);
  const open = useMemo(() => (openRows ?? []).map(toTask), [openRows]);
  const { spareMin: tomorrowSpareMin } = useTomorrowSpare(tomorrow, model.settings);

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
  const onToday = useMemo(() => open.filter((t) => t.doDate?.equals(model.today) && !t.routineRunId), [open, model.today]);

  const cap = model.capacity;
  const fitsMin = cap && cap.state !== "no_work_day" ? Math.max(0, cap.workMin - cap.busyMin - cap.bufferMin) : 0;
  const user = users?.[0];

  if (!model.ready || !model.settings) return <main className={cx(VIEW_COLUMN, "text-body text-ink-3")}>Opening…</main>;
  const settings = model.settings;

  return (
    <MorningPlanFlow meetings={model.meetings}
      capacity={cap}
      groups={groups}
      onToday={onToday}
      fitsMin={fitsMin}
      tomorrowSpareMin={tomorrowSpareMin}
      defaultEstimateMin={settings.defaultEstimateMin}
      carryAskAfter={settings.carryAskAfter}
      today={model.today}
      now={now}
      zone={settings.timezone}
      onPick={(task, picked) => {
        if (picked) void model.repo.reschedule(task.id, model.today);
        else if (groups.carried.some((t) => t.id === task.id)) void model.repo.reschedule(task.id, task.lastCarriedAt ?? model.today.subtract({ days: 1 }));
        else void model.repo.update(task.id, { doDate: null });
      }}
      onCarry={(id, to) => {
        if (to === "today") void model.repo.reschedule(id, model.today);
        else if (to === "tomorrow") void model.repo.reschedule(id, tomorrow);
        else void model.repo.setState(id, to === "someday" ? "someday" : "dropped");
      }}
      onMoveToTomorrow={(id) => void model.repo.reschedule(id, tomorrow)}
      onDone={() => {
        if (user?.personal_space_id) void dayPlans.upsert(model.today.toString(), { spaceId: user.personal_space_id, userId: user.id }, { plannedAt: new Date().toISOString() });
        router.push("/today");
      }}
      onSkip={() => router.push("/today")}
    />
  );
}
