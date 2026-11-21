// The carried-over pile and the day's two day_plans rows, as the review and its host both read them (the web's host,
// features/rituals/carry-review-host.tsx, reads the same): the rows Today shows, then the core rule
// (core/rollover/carried.ts), so the pile here is exactly Today's Carried over section, in its order.
import { useMemo } from "react";
import { carriedOver } from "@/core/rollover/carried"; // not the index: that carries the recurrence engine
import type { LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { toTask } from "@/data/mappers";
import { useQuery } from "@/data/powersync";
import { DAY_PLAN_SQL } from "@/data/queries/shell";
import { TASKS_THROUGH_TODAY_SQL } from "@/data/queries/today";
import type { TaskRow } from "@/data/schema.client";

const USER_SQL = `select id, personal_space_id from users limit 1`;

interface PlanRow {
  carry_reviewed_at: string | null;
  planned_at: string | null;
  shutdown_at: string | null;
}

export interface CarriedPile {
  /** False until the tasks and both day plans have been read. */
  loaded: boolean;
  carried: Task[];
  user: { id: string; personal_space_id: string | null } | undefined;
  /** Today's day_plans row, or null when there is none yet. */
  todayPlan: { carryReviewedAt: string | null; plannedAt: string | null } | null;
  /** Yesterday's row, or null. */
  yesterdayPlan: { shutdownAt: string | null } | null;
}

export function useCarried(today: LocalDate): CarriedPile {
  const todayIso = today.toString();
  const yesterdayIso = today.subtract({ days: 1 }).toString();
  const { data: users } = useQuery<{ id: string; personal_space_id: string | null }>(USER_SQL);
  const { data: taskRows, isLoading: loadingTasks } = useQuery<TaskRow>(TASKS_THROUGH_TODAY_SQL, [todayIso, todayIso]);
  const { data: todayRows, isLoading: loadingToday } = useQuery<PlanRow>(DAY_PLAN_SQL, [todayIso]);
  const { data: yesterdayRows, isLoading: loadingYesterday } = useQuery<PlanRow>(DAY_PLAN_SQL, [yesterdayIso]);
  const carried = useMemo(() => carriedOver((taskRows ?? []).map(toTask), today), [taskRows, todayIso]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    loaded: !loadingTasks && !loadingToday && !loadingYesterday,
    carried,
    user: users?.[0],
    todayPlan: todayRows?.[0] ? { carryReviewedAt: todayRows[0].carry_reviewed_at, plannedAt: todayRows[0].planned_at } : null,
    yesterdayPlan: yesterdayRows?.[0] ? { shutdownAt: yesterdayRows[0].shutdown_at } : null,
  };
}
