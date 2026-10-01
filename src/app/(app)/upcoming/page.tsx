"use client";
// Upcoming (SCREENS.md §3): the next seven days from today as an agenda, and
// what is not yet planned. Today always keeps its own header; a run of free
// days after it folds into one line and opens into per-day drop targets only
// while a row is being dragged. Below the week the agenda keeps going (§6):
// later dated tasks by day under "Later this month", "Next month" and month
// names. A task whose start date has not come is hidden from all of it and
// waits, collapsed, under "Starting later" on its start day. Per-day capacity
// bars arrive with P6.
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@/data/powersync";
import { keyBetween } from "@/core/ordering";
import { formatMinutes, type LocalDate } from "@/core/time";
import { formatDay, weekdayName } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import { toTask } from "@/data/mappers";
import { PLANNED_AFTER_SQL, PLANNED_BETWEEN_SQL, STARTING_LATER_SQL, UNPLANNED_SQL, dayRangeParams } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useQuickAdd } from "@/features/quickadd/quick-add-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useWorkingSetSynced } from "@/features/shell/use-working-set";
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
import { CollapsedGroup } from "@/ui/collapsed-group";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { EmptyCard } from "@/ui/list-card";
import { EYEBROW, SectionLabel } from "@/ui/section-label";
import { LOADING_LINE } from "../loading-view";
import { laterGroups, startingByDay, type AgendaDay } from "./later";

const DAYS = 7;

const dayLabel = (day: LocalDate) => `${weekdayName(day)} ${day.day}`;

export default function UpcomingPage() {
  const repo = useTaskRepo();
  const detail = useTaskDetail();
  const quickAdd = useQuickAdd();
  const now = useNow();
  const { today, settings } = useLocalDay(now);
  const synced = useWorkingSetSynced();
  const [from, to] = dayRangeParams(today, DAYS);
  const todayIso = today.toString();
  const { data: planned } = useQuery<TaskRowType>(PLANNED_BETWEEN_SQL, [from, to]);
  const { data: unplannedRows } = useQuery<TaskRowType>(UNPLANNED_SQL, [todayIso]);
  const { data: laterRows } = useQuery<TaskRowType>(PLANNED_AFTER_SQL, [to, todayIso]);
  const { data: startingRows } = useQuery<TaskRowType>(STARTING_LATER_SQL, [todayIso]);
  const projectNames = useProjectNames();

  const starting = useMemo(() => (startingRows ?? []).map(toTask), [startingRows]);
  const days = useMemo(() => {
    const byDay = new Map<string, Task[]>();
    for (const row of planned ?? []) {
      const t = toTask(row);
      const key = t.doDate?.toString() ?? "";
      byDay.set(key, [...(byDay.get(key) ?? []), t]);
    }
    const startsOn = startingByDay(starting);
    return Array.from({ length: DAYS }, (_, i): AgendaDay => {
      const day = today.add({ days: i });
      return { day, tasks: byDay.get(day.toString()) ?? [], startingLater: startsOn.get(day.toString()) ?? [] };
    });
  }, [planned, starting, today]);
  const later = useMemo(() => laterGroups((laterRows ?? []).map(toTask), starting, today, today.add({ days: DAYS - 1 })), [laterRows, starting, today]);
  const unplanned = (unplannedRows ?? []).map(toTask);

  // J/K walks what can be seen, in display order: the week, the rail, then the later days. A collapsed
  // "Starting later" group joins only while it is open.
  const [openStarting, setOpenStarting] = useState<ReadonlySet<string>>(() => new Set());
  const toggleStarting = useCallback((key: string, open: boolean) => {
    setOpenStarting((s) => {
      if (s.has(key) === open) return s;
      const next = new Set(s);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const dayIds = (d: AgendaDay) => [...d.tasks.map((t) => t.id), ...(openStarting.has(d.day.toString()) ? d.startingLater.map((t) => t.id) : [])];
  const sel = useListSelection([...days.map(dayIds), unplanned.map((t) => t.id), ...later.flatMap((g) => g.days.map(dayIds))]);

  const estimate = (t: Task) => t.estimateMin ?? settings?.defaultEstimateMin ?? 30;
  const [todayGroup, ...rest] = days;
  const segments = foldFreeDays(rest, (d) => d.tasks.length === 0 && d.startingLater.length === 0);
  const loaded = planned !== undefined && unplannedRows !== undefined && laterRows !== undefined && startingRows !== undefined;
  const empty = loaded && unplanned.length === 0 && later.length === 0 && days.every((d) => d.tasks.length === 0 && d.startingLater.length === 0);
  // An empty list on a device still on its first sync is not a fact yet (SCREENS.md §21).
  const nothingAtAll = empty && synced;
  const waiting = empty && !synced;

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
  const tomorrow = today.add({ days: 1 });
  // The same moves every other list offers — the hover zone on a pointer, the "More actions"
  // menu on a phone — minus the day the row already sits on.
  const dayActions = (t: Task, day: LocalDate) => (
    <MoveActions
      onToday={day.equals(today) ? undefined : () => void repo.reschedule(t.id, today)}
      onTomorrow={day.equals(tomorrow) ? undefined : () => void repo.reschedule(t.id, tomorrow)}
      onSomeday={() => void repo.setState(t.id, "someday")}
    />
  );
  const dayRows = (day: LocalDate, tasks: Task[]) => (
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
          actions={dayActions(t, day)}
        />
      ))}
    </TaskList>
  );
  // Hidden by a start date: listed on the day it starts, collapsed; opening one is how its dates are changed.
  const startingGroup = (d: AgendaDay) =>
    d.startingLater.length > 0 && (
      <CollapsedGroup label="Starting later" count={d.startingLater.length} onToggle={(open) => toggleStarting(d.day.toString(), open)}>
        <TaskList>
          {d.startingLater.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              today={today}
              onOpen={() => detail.open(t.id)}
              selected={sel.selectedId === t.id}
              onSelect={() => sel.select(t.id)}
              onDone={() => void repo.complete(t.id)}
              meta={meta(t)}
            />
          ))}
        </TaskList>
      </CollapsedGroup>
    );
  const minutes = (tasks: Task[]) => formatMinutes(tasks.reduce((s, t) => s + estimate(t), 0));

  const renderDay = (d: AgendaDay, isToday = false) => (
    <DropZone key={d.day.toString()} label={dayLabel(d.day)} onDropTask={dropOnDay(d.day, d.tasks)}>
      <section className="flex flex-col gap-2">
        <SectionLabel className="px-0.5" count={d.tasks.length > 0 ? d.tasks.length : undefined} detail={d.tasks.length > 0 ? minutes(d.tasks) : undefined}>
          {dayLabel(d.day)}
          {isToday && <span className="ml-2 font-medium normal-case tracking-normal text-ink-2">today</span>}
        </SectionLabel>
        {d.tasks.length === 0 ? (
          // On the title's own column, so an empty day reads as a line in the list rather than a stray note.
          <p className="pl-11 text-body text-ink-3">Free.</p>
        ) : (
          dayRows(d.day, d.tasks)
        )}
        {startingGroup(d)}
      </section>
    </DropZone>
  );

  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader eyebrow="Upcoming · rolling 7 days" title={`${weekdayName(today)} ${today.day} – ${formatDay(today.add({ days: DAYS - 1 }), { month: "long" })}`} />
      {waiting ? (
        <p className={LOADING_LINE}>Getting your tasks…</p>
      ) : nothingAtAll ? (
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
                // The rail's own fact; whether anything is scheduled is what the days above say.
                synced && <p className="pl-11 text-body text-ink-3">Every task has a day.</p>
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
          {/* Past the week the agenda keeps going below the columns (SCREENS.md §6), by month group, then by day. */}
          {later.map((g) => (
            <section key={g.key} className="flex flex-col gap-3">
              <SectionLabel className="px-0.5" count={g.days.reduce((n, d) => n + d.tasks.length, 0) || undefined}>
                {g.label}
              </SectionLabel>
              {g.days.map((d) => (
                <DropZone key={d.day.toString()} label={formatDay(d.day, { today })} onDropTask={dropOnDay(d.day, d.tasks)}>
                  <div className="flex flex-col gap-2">
                    <h3 className="px-0.5 text-body-sm font-medium text-ink-2 num">
                      {formatDay(d.day, { today })}
                      {d.tasks.length > 0 && <span className="font-normal text-ink-3"> · {minutes(d.tasks)}</span>}
                    </h3>
                    {d.tasks.length > 0 && dayRows(d.day, d.tasks)}
                    {startingGroup(d)}
                  </div>
                </DropZone>
              ))}
            </section>
          ))}
        </>
      )}
    </main>
  );
}
