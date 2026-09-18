"use client";
// Upcoming (SCREENS.md §3): the next seven days from today as an agenda, and
// what is not yet planned. Per-day capacity bars arrive with P6.
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { keyBetween } from "@/core/ordering";
import { formatMinutes, type LocalDate } from "@/core/time";
import { formatDay, weekdayName } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import { toTask } from "@/data/mappers";
import { PLANNED_BETWEEN_SQL, UNPLANNED_SQL, dayRangeParams } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { EmptyState, VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { DropZone } from "@/features/tasks/drop-zone";
import { planDrop, type Edge } from "@/features/tasks/reorder";
import { MoveActions } from "@/features/tasks/task-actions";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useListSelection } from "@/features/selection/selection-provider";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { SectionLabel } from "@/ui/section-label";

const DAYS = 7;

export default function UpcomingPage() {
  const repo = useTaskRepo();
  const detail = useTaskDetail();
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
  const sel = useListSelection([...days.map((d) => d.tasks.map((t) => t.id)), unplanned.map((t) => t.id)]);
  const estimate = (t: Task) => t.estimateMin ?? settings?.defaultEstimateMin ?? 30;

  // Drag a row onto a day (its list, or a row in it for a place) or back onto "Not yet planned".
  const dropOnDay = (day: LocalDate, list: Task[]) => (sourceId: string) => {
    if (list.some((x) => x.id === sourceId)) return;
    void repo.placeInDay(sourceId, day, keyBetween(list[list.length - 1]?.daySortKey ?? null, null));
  };
  const dropOnRow = (day: LocalDate, list: Task[]) => (sourceId: string, targetId: string, edge: Edge) => {
    const plan = planDrop(
      list.map((x) => ({ id: x.id, key: x.daySortKey })),
      sourceId,
      targetId,
      edge,
    );
    if (!plan) return;
    void (list.some((x) => x.id === sourceId) ? repo.setDayOrder(sourceId, plan.key) : repo.placeInDay(sourceId, day, plan.key));
  };
  const dropOnUnplanned = (sourceId: string) => {
    if (!unplanned.some((x) => x.id === sourceId)) void repo.reschedule(sourceId, null);
  };

  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader
        eyebrow="Upcoming · rolling 7 days"
        title={`${weekdayName(today)} ${today.day} – ${formatDay(today.add({ days: DAYS - 1 }), { month: "long" })}`}
      />
      {days.map(({ day, tasks }, i) => (
        <DropZone key={day.toString()} label={`${weekdayName(day)} ${day.day}`} onDropTask={dropOnDay(day, tasks)}>
          <section className="flex flex-col gap-2">
            <SectionLabel className="px-0.5" count={tasks.length > 0 ? tasks.length : undefined} detail={tasks.length > 0 ? formatMinutes(tasks.reduce((s, t) => s + estimate(t), 0)) : undefined}>
              {weekdayName(day)} {day.day}
              {i === 0 && <span className="ml-2 font-medium normal-case tracking-normal text-ink-2">today</span>}
            </SectionLabel>
            {tasks.length === 0 ? (
              <p className="px-4 text-body-lg text-ink-3">Free.</p>
            ) : (
              <TaskList>
                {tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    today={today}
                    draggable
                    onDropTask={(src, edge) => dropOnRow(day, tasks)(src, t.id, edge)}
                    onOpen={() => detail.open(t.id)}
                    selected={sel.selectedId === t.id}
                    onSelect={() => sel.select(t.id)}
                    onDone={() => void repo.complete(t.id)}
                  />
                ))}
              </TaskList>
            )}
          </section>
        </DropZone>
      ))}
      <DropZone label="Not yet planned" onDropTask={dropOnUnplanned}>
        <section className="flex flex-col gap-2">
          <SectionLabel className="px-0.5" count={unplanned.length > 0 ? unplanned.length : undefined}>
            Not yet planned
          </SectionLabel>
          {unplanned.length === 0 ? (
            <EmptyState>Nothing scheduled beyond today.</EmptyState>
          ) : (
            <TaskList>
              {unplanned.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  today={today}
                  draggable
                  onOpen={() => detail.open(t.id)}
                  selected={sel.selectedId === t.id}
                  onSelect={() => sel.select(t.id)}
                  onDone={() => void repo.complete(t.id)}
                  actions={<MoveActions onToday={() => void repo.reschedule(t.id, today)} onTomorrow={() => void repo.reschedule(t.id, today.add({ days: 1 }))} onSomeday={() => void repo.setState(t.id, "someday")} />}
                />
              ))}
            </TaskList>
          )}
        </section>
      </DropZone>
    </main>
  );
}
