"use client";
// Upcoming (SCREENS.md §3): the next seven days from today as an agenda, and
// what is not yet planned. Today always keeps its own header; a run of free
// days after it folds into one line and opens into per-day drop targets only
// while a row is being dragged. Per-day capacity bars arrive with P6.
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@/data/powersync";
import { keyBetween } from "@/core/ordering";
import { formatMinutes, type LocalDate } from "@/core/time";
import { formatDay, weekdayName } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import { toTask } from "@/data/mappers";
import { PLANNED_BETWEEN_SQL, UNPLANNED_SQL, dayRangeParams } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useQuickAdd } from "@/features/quickadd/quick-add-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { DropZone } from "@/features/tasks/drop-zone";
import { foldFreeDays } from "@/features/tasks/free-days";
import { planDrop, type Edge } from "@/features/tasks/reorder";
import { MoveActions } from "@/features/tasks/task-actions";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useListSelection } from "@/features/selection/selection-provider";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { EmptyCard } from "@/ui/list-card";
import { EYEBROW, SectionLabel } from "@/ui/section-label";

const DAYS = 7;

interface DayGroup {
  day: LocalDate;
  tasks: Task[];
}

const dayLabel = (day: LocalDate) => `${weekdayName(day)} ${day.day}`;

export default function UpcomingPage() {
  const repo = useTaskRepo();
  const detail = useTaskDetail();
  const quickAdd = useQuickAdd();
  const now = useNow();
  const { today, settings } = useLocalDay(now);
  const [from, to] = dayRangeParams(today, DAYS);
  const { data: planned } = useQuery<TaskRowType>(PLANNED_BETWEEN_SQL, [from, to]);
  const { data: unplannedRows } = useQuery<TaskRowType>(UNPLANNED_SQL);
  const projectNames = useProjectNames();

  const days = useMemo(() => {
    const byDay = new Map<string, Task[]>();
    for (const row of planned ?? []) {
      const t = toTask(row);
      const key = t.doDate?.toString() ?? "";
      byDay.set(key, [...(byDay.get(key) ?? []), t]);
    }
    return Array.from({ length: DAYS }, (_, i): DayGroup => {
      const day = today.add({ days: i });
      return { day, tasks: byDay.get(day.toString()) ?? [] };
    });
  }, [planned, today]);
  const unplanned = (unplannedRows ?? []).map(toTask);
  const sel = useListSelection([...days.map((d) => d.tasks.map((t) => t.id)), unplanned.map((t) => t.id)]);
  const estimate = (t: Task) => t.estimateMin ?? settings?.defaultEstimateMin ?? 30;
  const [todayGroup, ...rest] = days;
  const segments = foldFreeDays(rest, (d) => d.tasks.length === 0);
  const nothingAtAll = planned !== undefined && unplannedRows !== undefined && unplanned.length === 0 && days.every((d) => d.tasks.length === 0);

  // A folded run of free days shows its day targets only while a row is in the air.
  const [dragging, setDragging] = useState(false);
  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => source.data.type === "task",
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
    [],
  );

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

  const meta = (t: Task) => t.projectId && projectNames.has(t.projectId) && <span>{projectNames.get(t.projectId)}</span>;

  const renderDay = ({ day, tasks }: DayGroup, isToday = false) => (
    <DropZone key={day.toString()} label={dayLabel(day)} onDropTask={dropOnDay(day, tasks)}>
      <section className="flex flex-col gap-2">
        <SectionLabel className="px-0.5" count={tasks.length > 0 ? tasks.length : undefined} detail={tasks.length > 0 ? formatMinutes(tasks.reduce((s, t) => s + estimate(t), 0)) : undefined}>
          {dayLabel(day)}
          {isToday && <span className="ml-2 font-medium normal-case tracking-normal text-ink-2">today</span>}
        </SectionLabel>
        {tasks.length === 0 ? (
          <p className="px-4 text-body text-ink-3">Free.</p>
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
                meta={meta(t)}
              />
            ))}
          </TaskList>
        )}
      </section>
    </DropZone>
  );

  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader eyebrow="Upcoming · rolling 7 days" title={`${weekdayName(today)} ${today.day} – ${formatDay(today.add({ days: DAYS - 1 }), { month: "long" })}`} />
      {nothingAtAll ? (
        <div className="flex flex-col gap-3">
          <Icon name="calendar-week" size={20} className="text-ink-3" />
          <EmptyCard
            fact="Nothing scheduled beyond today."
            action={
              <Button variant="link" onClick={() => quickAdd.open()}>
                Add a task
                <Icon name="chevron-right" size={16} className="text-ink-3" />
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {renderDay(todayGroup, true)}
          {segments.map((seg) =>
            seg.kind === "day" ? (
              renderDay(seg.day)
            ) : (
              <section key={seg.days[0].day.toString()} className="flex flex-col gap-2">
                {/* The section label's shape with the dot given its own room: the glyph sits tight against a following word. */}
                <h2 className={cx(EYEBROW, "px-0.5")}>
                  {dayLabel(seg.days[0].day)} – {dayLabel(seg.days[seg.days.length - 1].day)}
                  <span className="ml-2 font-medium normal-case tracking-normal">
                    <span className="mr-1.5 text-ink-4">·</span>free
                  </span>
                </h2>
                {dragging && (
                  <div className="grid grid-flow-col auto-cols-fr gap-2">
                    {seg.days.map(({ day, tasks }) => (
                      <DropZone key={day.toString()} label={dayLabel(day)} onDropTask={dropOnDay(day, tasks)}>
                        <div className="flex h-11 items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface text-body-sm font-medium text-ink-2 num">{dayLabel(day)}</div>
                      </DropZone>
                    ))}
                  </div>
                )}
              </section>
            ),
          )}
          <DropZone label="Not yet planned" onDropTask={dropOnUnplanned}>
            <section className="flex flex-col gap-2">
              <SectionLabel className="px-0.5" count={unplanned.length > 0 ? unplanned.length : undefined}>
                Not yet planned
              </SectionLabel>
              {unplanned.length === 0 ? (
                <p className="px-4 text-body text-ink-3">Nothing scheduled beyond today.</p>
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
                      meta={meta(t)}
                      actions={<MoveActions onToday={() => void repo.reschedule(t.id, today)} onTomorrow={() => void repo.reschedule(t.id, today.add({ days: 1 }))} onSomeday={() => void repo.setState(t.id, "someday")} />}
                    />
                  ))}
                </TaskList>
              )}
            </section>
          </DropZone>
        </>
      )}
    </main>
  );
}
