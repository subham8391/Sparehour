"use client";
// The morning review's host (SCREENS.md §2.3a). Mounted once in the shell,
// inside the providers, it watches the carried-over pile, the sync state and
// today's and yesterday's day plans, and opens the review sheet on the first
// open of a new day when the rules in carry-review.ts say so, or whenever
// Today asks through `useCarryReview().open()`. The sheet is a lazy island,
// fetched once there is something to review, so the shell's first download
// does not carry it.
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { carriedOver } from "@/core/rollover/carried"; // not the index: that carries the recurrence engine (§11.6)
import { toTask } from "@/data/mappers";
import { TASKS_THROUGH_TODAY_SQL } from "@/data/queries/today";
import { DAY_PLAN_SQL } from "@/data/queries/views";
import { DayPlanRepo } from "@/data/repositories/day-plan-repo";
import type { TaskRow } from "@/data/schema.client";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useSyncChip } from "@/features/shell/use-sync-chip";
import { convertedProjectHref } from "@/features/tasks/use-convert";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { shouldReview } from "./carry-review";

const loadSheet = () => import("./carry-review-sheet");
const CarryReviewSheet = dynamic(() => loadSheet().then((m) => m.CarryReviewSheet), { ssr: false });

const USER_SQL = `select id, personal_space_id from users limit 1`;

interface PlanRow {
  carry_reviewed_at: string | null;
  planned_at: string | null;
  shutdown_at: string | null;
}

export interface CarryReviewApi {
  /** How many tasks are carried over today. */
  carried: number;
  /** Opens the review now, whatever the morning rules say. */
  open: () => void;
}

const CarryReviewContext = createContext<CarryReviewApi | null>(null);

/** The review's API, or null outside the host (tests, scripts). */
export function useCarryReview(): CarryReviewApi | null {
  return useContext(CarryReviewContext);
}

export function CarryReviewHost({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const now = useNow();
  const { today, settings } = useLocalDay(now);
  const sync = useSyncChip();
  const repo = useTaskRepo();
  const db = useLocalDatabase();
  const todayIso = today.toString();
  const yesterdayIso = today.subtract({ days: 1 }).toString();

  const { data: users } = useQuery<{ id: string; personal_space_id: string | null }>(USER_SQL);
  // The same rows Today shows, then the core rule, so the pile here is exactly the Carried over section.
  const { data: taskRows, isLoading: loadingTasks } = useQuery<TaskRow>(TASKS_THROUGH_TODAY_SQL, [todayIso, todayIso]);
  const { data: todayRows, isLoading: loadingToday } = useQuery<PlanRow>(DAY_PLAN_SQL, [todayIso]);
  const { data: yesterdayRows, isLoading: loadingYesterday } = useQuery<PlanRow>(DAY_PLAN_SQL, [yesterdayIso]);
  const carried = carriedOver((taskRows ?? []).map(toTask), today);
  const hasCarried = carried.length > 0;

  // Opened from Today's "Review carried" link.
  const [manual, setManual] = useState(false);
  // The day this session already answered or dismissed: covers the moment between the stamp and its echo from the local database.
  const [handled, setHandled] = useState<string | null>(null);

  const todayPlan = todayRows?.[0] ? { carryReviewedAt: todayRows[0].carry_reviewed_at, plannedAt: todayRows[0].planned_at } : null;
  const yesterdayPlan = yesterdayRows?.[0] ? { shutdownAt: yesterdayRows[0].shutdown_at } : null;
  // Never before the shell has the person's settings and the rows have been read; the restore gate sits above the shell.
  const loaded = settings !== null && !loadingTasks && !loadingToday && !loadingYesterday;
  const auto = loaded && handled !== todayIso && shouldReview({ enabled: settings.carryReview, carried: carried.length, syncState: sync.state, pathname, today: todayPlan, yesterday: yesterdayPlan });
  const show = auto || (manual && hasCarried);

  useEffect(() => {
    if (hasCarried) return preloadOnIdle(loadSheet);
  }, [hasCarried]);

  const user = users?.[0];
  const stamp = async () => {
    setHandled(todayIso);
    if (!user?.personal_space_id) return;
    await new DayPlanRepo(db).upsert(todayIso, { spaceId: user.personal_space_id, userId: user.id }, { carryReviewedAt: new Date().toISOString() });
  };
  const close = () => {
    setManual(false);
    setHandled(todayIso);
  };

  return (
    <CarryReviewContext.Provider value={{ carried: carried.length, open: () => setManual(true) }}>
      {children}
      {show && (
        <CarryReviewSheet
          tasks={carried}
          today={today}
          repo={repo}
          carryAskAfter={settings?.carryAskAfter ?? null}
          zone={settings?.timezone ?? "UTC"}
          now={now}
          onStamp={stamp}
          onClose={close}
          onOpenProject={(id) => router.push(convertedProjectHref(id))}
        />
      )}
    </CarryReviewContext.Provider>
  );
}
