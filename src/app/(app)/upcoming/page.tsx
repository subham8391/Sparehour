"use client";
// Upcoming (SCREENS.md §3): the next seven days from today as an agenda, and
// what is not yet planned. Per-day capacity bars arrive with P6.
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { formatMinutes, type LocalDate } from "@/core/time";
import { formatDay, weekdayName } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import { toTask } from "@/data/mappers";
import { PLANNED_BETWEEN_SQL, UNPLANNED_SQL, dayRangeParams } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { EmptyState, ViewHeader } from "@/features/shell/view-header";
import { MoveActions } from "@/features/tasks/task-actions";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useTaskRepo } from "@/features/tasks/use-task-repo";

const DAYS = 7;

export default function UpcomingPage() {
  const repo = useTaskRepo();
  const now = useNow();
  const { today, settings } = useLocalDay(now);
  const [from, to] = dayRangeParams(today, DAYS);
  const { data: planned } = useQuery<TaskRowType>(PLANNED_BETWEEN_SQL, [from, to]);
  const { data: unplannedRows } = useQuery<TaskRowType>(UNPLANNED_SQL);

  const days = useMemo(() => {
    const byDay = new Map<string, Task[]>();
    for (const row of planned ?? []) {
      const t = toTask(row);
      const key = t.doDate?.toString() ?? "";
      byDay.set(key, [...(byDay.get(key) ?? []), t]);
    }
    return Array.from({ length: DAYS }, (_, i): { day: LocalDate; tasks: Task[] } => {
      const day = today.add({ days: i });
      return { day, tasks: byDay.get(day.toString()) ?? [] };
    });
  }, [planned, today]);
  const unplanned = (unplannedRows ?? []).map(toTask);
  const estimate = (t: Task) => t.estimateMin ?? settings?.defaultEstimateMin ?? 30;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-10">
      <ViewHeader
        eyebrow="Upcoming · rolling 7 days"
        title={`${weekdayName(today)} ${today.day} – ${formatDay(today.add({ days: DAYS - 1 }), { month: "long" })}`}
      />
      {days.map(({ day, tasks }, i) => (
        <section key={day.toString()} className="flex flex-col gap-2">
          <h2 className="px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            {weekdayName(day)} {day.day}
            {i === 0 && <span className="ml-2 normal-case tracking-normal text-ink-2">today</span>}
            {tasks.length > 0 && (
              <span className="ml-2 font-mono normal-case tracking-normal">
                {tasks.length} · {formatMinutes(tasks.reduce((s, t) => s + estimate(t), 0))}
              </span>
            )}
          </h2>
          {tasks.length === 0 ? (
            <p className="px-4 text-[15px] text-ink-3">Free.</p>
          ) : (
            <TaskList>
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} onDone={() => void repo.complete(t.id)} />
              ))}
            </TaskList>
          )}
        </section>
      ))}
      <section className="flex flex-col gap-2">
        <h2 className="px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          Not yet planned{unplanned.length > 0 && <span className="ml-2 font-mono normal-case tracking-normal">{unplanned.length}</span>}
        </h2>
        {unplanned.length === 0 ? (
          <EmptyState>Nothing scheduled beyond today.</EmptyState>
        ) : (
          <TaskList>
            {unplanned.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onDone={() => void repo.complete(t.id)}
                actions={<MoveActions onToday={() => void repo.reschedule(t.id, today)} onTomorrow={() => void repo.reschedule(t.id, today.add({ days: 1 }))} onSomeday={() => void repo.setState(t.id, "someday")} />}
              />
            ))}
          </TaskList>
        )}
      </section>
    </main>
  );
}
