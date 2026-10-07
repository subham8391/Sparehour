"use client";
// Upcoming, the week planner (SCREENS.md §3, §6): seven days with each day's
// capacity bar and readout and the week's spare total, for moving work
// between days. From the narrow band up the days are columns (three that
// scroll, five weekdays and a folded weekend, or all seven and the "Not yet
// planned" rail); on a phone they stack as an agenda, a run of free days
// folded into one line of day cells. `[` and `]` step a week, never before
// this one; "Calendar week" swaps the next seven days for the week on the
// person's week start. Past the week the agenda keeps going by day, with
// capacity readouts out to day 14, a "Due" group on the day a deadline falls,
// and tasks waiting for their start date under "Starting later". On a phone a
// 7-day strip of mini bars stays pinned over the agenda (a tap jumps to the
// day), and "Not yet planned" is a strip pinned above the tab bar that opens
// a sheet with a day picker per task.
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CapacityTask } from "@/core/capacity";
import { keyBetween } from "@/core/ordering";
import { compareDates, formatMinutes, localDate, type LocalDate } from "@/core/time";
import { formatDay, weekdayName } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import { useQuery } from "@/data/powersync";
import { toTask } from "@/data/mappers";
import { PLANNED_AFTER_SQL, PLANNED_BETWEEN_SQL, STARTING_LATER_SQL, UNPLANNED_SQL } from "@/data/queries/views";
import { DUE_FROM_SQL, WEEK_START_SQL } from "@/data/queries/week";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useQuickAdd } from "@/features/quickadd/quick-add-provider";
import { useListSelection } from "@/features/selection/selection-provider";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useWorkingSetSynced } from "@/features/shell/use-working-set";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { DropZone } from "@/features/tasks/drop-zone";
import { foldFreeDays } from "@/features/tasks/free-days";
import { planDrop, type Edge } from "@/features/tasks/reorder";
import { MoveActions } from "@/features/tasks/task-actions";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useConvertToProject } from "@/features/tasks/use-convert";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { DayBar, ReadoutText } from "@/features/upcoming/capacity-bar";
import { CompactRow } from "@/features/upcoming/compact-row";
import { DayStrip, type StripDay } from "@/features/upcoming/day-strip";
import { dueByDay, laterGroups, startingByDay, type AgendaDay } from "@/features/upcoming/later";
import { RailColumn, UnplannedButton, UnplannedStrip } from "@/features/upcoming/unplanned";
import { useWeekCapacity } from "@/features/upcoming/use-week-capacity";
import { useWeekKeys } from "@/features/upcoming/use-week-keys";
import { useWeekBand, useWeekMode } from "@/features/upcoming/use-week-view";
import { clampOffset, dayPrefill, dayReadout, shiftDay, weekTotalLine, weekWindow, type DayReadout } from "@/features/upcoming/week";
import { WeekColumns, bandColumns, columnIds, dayLabel, type ColumnDay } from "@/features/upcoming/week-columns";
import { Button, iconButtonClass } from "@/ui/button";
import { CollapsedGroup } from "@/ui/collapsed-group";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { EmptyCard } from "@/ui/list-card";
import { EYEBROW, SectionLabel } from "@/ui/section-label";
import { scrollMotion } from "@/ui/reduced-motion";
import { Segmented } from "@/ui/segmented";
import { LOADING_LINE } from "../loading-view";

/** Capacity readouts reach this many days ahead (SCREENS.md §6). */
const READOUT_DAYS = 14;

// The rail's sheet, with a day picker per task, loads in idle time and mounts on the first open.
const loadUnplannedSheet = () => import("@/features/upcoming/unplanned-sheet");
const UnplannedSheet = dynamic(() => loadUnplannedSheet().then((m) => m.UnplannedSheet), { ssr: false });

/** The id of a stacked day's header, where the strip's jump lands. */
const agendaId = (day: LocalDate) => `agenda-${day.toString()}`;

/** "Tue 6 – Mon 12 October", or "Wed 28 Oct – Tue 3 Nov" across a month. */
function rangeTitle(first: LocalDate, last: LocalDate, today: LocalDate): string {
  if (first.month === last.month && first.year === last.year) return `${weekdayName(first)} ${first.day} – ${formatDay(last, { month: "long", today })}`;
  return `${formatDay(first, { today })} – ${formatDay(last, { today })}`;
}

/** Where a row in the air would land, read from the drop target under it (a day's `data-day`). */
interface DragOver {
  id: string;
  /** ISO day, or null over "Not yet planned". */
  day: string | null;
  evening: boolean | null;
  /** The row under it, when it hovers over one: the task takes that row's part of the day. */
  row: string | null;
}

export default function UpcomingPage() {
  const repo = useTaskRepo();
  const detail = useTaskDetail();
  // "Long — break it down?" answers itself: the row offers Convert to project (PRODUCT_SPEC.md §5.4, §6).
  const breakDown = useConvertToProject(repo, detail.close);
  const quickAdd = useQuickAdd();
  const now = useNow();
  const { today, settings } = useLocalDay(now);
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

  const { data: planned } = useQuery<TaskRowType>(PLANNED_BETWEEN_SQL, [from, to]);
  const { data: unplannedRows } = useQuery<TaskRowType>(UNPLANNED_SQL, [todayIso]);
  const { data: laterRows } = useQuery<TaskRowType>(PLANNED_AFTER_SQL, [to, todayIso]);
  const { data: startingRows } = useQuery<TaskRowType>(STARTING_LATER_SQL, [todayIso]);
  const { data: dueRows } = useQuery<TaskRowType>(DUE_FROM_SQL, [compareDates(first, today) < 0 ? from : todayIso]);
  const projectNames = useProjectNames();

  const mainRef = useRef<HTMLElement>(null);
  const band = useWeekBand(mainRef);
  const columnsLayout = band !== "phone";

  const starting = useMemo(() => (startingRows ?? []).map(toTask), [startingRows]);
  const due = useMemo(() => (dueRows ?? []).map(toTask), [dueRows]);
  const unplanned = useMemo(() => (unplannedRows ?? []).map(toTask), [unplannedRows]);
  const plannedTasks = useMemo(() => (planned ?? []).map(toTask), [planned]);
  const laterTasks = useMemo(() => (laterRows ?? []).map(toTask), [laterRows]);
  const later = useMemo(() => laterGroups(laterTasks, starting, today, last, due), [laterTasks, starting, today, last, due]);

  // ---- a row in the air: both days' bars show where it would land (SCREENS.md §3 "Drag")
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<DragOver | null>(null);
  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => source.data.type === "task",
        onDragStart: () => setDragging(true),
        onDropTargetChange: ({ source, location }) => {
          const target = location.current.dropTargets[0]?.element as HTMLElement | undefined;
          const zone = target?.closest<HTMLElement>("[data-day], [data-rail]");
          if (!zone) return setOver(null);
          const day = zone.dataset.day ?? null;
          setOver({ id: String(source.data.id), day, evening: zone.dataset.evening !== undefined ? true : null, row: target?.dataset.id ?? null });
        },
        onDrop: () => {
          setDragging(false);
          setOver(null);
        },
      }),
    [],
  );
  const allTasks = useMemo(() => [...plannedTasks, ...laterTasks, ...unplanned, ...starting, ...due], [plannedTasks, laterTasks, unplanned, starting, due]);
  const findTask = useCallback((id: string) => allTasks.find((t) => t.id === id) ?? null, [allTasks]);
  const preview = useMemo((): CapacityTask | null => {
    const t = over ? findTask(over.id) : null;
    if (!over || !t) return null;
    // Dropped on a row it joins that row's list (dropOnRow); dropped on the day it keeps its own part of it (dropOnDay).
    const evening = over.evening ?? (over.row ? findTask(over.row)?.evening : undefined) ?? t.evening;
    if ((t.doDate?.toString() ?? null) === over.day && evening === t.evening) return null;
    return { id: t.id, state: t.state, doDate: over.day ? localDate(over.day) : null, estimateMin: t.estimateMin, evening, daySortKey: t.daySortKey };
  }, [over, findTask]);

  // ---- capacity: the week's days from today on, and every day out to day 14 for the agenda's readouts
  const capFrom = compareDates(first, today) < 0 ? today : first;
  const readoutEnd = today.add({ days: READOUT_DAYS - 1 });
  const capTo = compareDates(last, readoutEnd) > 0 ? last : readoutEnd;
  const capacity = useWeekCapacity({ from: capFrom, to: capTo, today, now, settings, preview });
  const readoutFor = useCallback(
    (day: LocalDate): DayReadout | null => {
      const c = capacity.byDay.get(day.toString());
      return c && compareDates(day, today) >= 0 ? dayReadout(c, day.equals(today)) : null;
    },
    [capacity, today],
  );

  const days = useMemo((): ColumnDay[] => {
    const byDay = new Map<string, Task[]>();
    for (const t of plannedTasks) {
      const key = t.doDate?.toString() ?? "";
      byDay.set(key, [...(byDay.get(key) ?? []), t]);
    }
    const startsOn = startingByDay(starting);
    const dueOn = dueByDay(due);
    return windowDays.map((day) => {
      const iso = day.toString();
      const past = compareDates(day, today) < 0;
      return {
        day,
        tasks: byDay.get(iso) ?? [],
        startingLater: startsOn.get(iso) ?? [],
        due: dueOn.get(iso) ?? [],
        isToday: day.equals(today),
        past,
        capacity: past ? null : (capacity.byDay.get(iso) ?? null),
        readout: readoutFor(day),
      };
    });
  }, [plannedTasks, starting, due, windowDays, today, capacity, readoutFor]);
  const totalLine = capacity.byDay.size > 0 ? weekTotalLine(days.filter((d) => !d.past).map((d) => d.readout), offset === 0) : null;

  // ---- what J/K and Tab walk: the columns (or the stacked days), the rail, then the later days
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
  const navColumns = columnsLayout ? bandColumns(days, band).map((c) => columnIds(c.days, openStarting)) : days.map((d) => columnIds([d], openStarting));
  const laterIds = later.flatMap((g) => g.days.map((d) => columnIds([{ ...d, isToday: false, past: false, capacity: null, readout: null }], openStarting)));
  const sel = useListSelection([...navColumns, unplanned.map((t) => t.id), ...laterIds]);
  // The rail is the last column for Tab where it sits beside the days.
  const tabColumns = band === "wide" ? [...navColumns, unplanned.map((t) => t.id)] : navColumns;

  const loaded = planned !== undefined && unplannedRows !== undefined && laterRows !== undefined && startingRows !== undefined;
  const waiting = loaded && !synced && plannedTasks.length === 0 && unplanned.length === 0 && later.length === 0;
  // "Nothing scheduled beyond today." (SCREENS.md §21): no day after today has anything, here or further on.
  const noneAhead = loaded && synced && offset === 0 && later.length === 0 && days.every((d) => d.isToday || d.past || (d.tasks.length === 0 && d.startingLater.length === 0));

  // ---- moves
  /** The day's last place, so a task moved there goes to the end of it. Keys compare as plain strings (§5.6). */
  const lastKey = (list: readonly Task[]) => list.reduce<string | null>((max, t) => (t.daySortKey && (max === null || t.daySortKey > max) ? t.daySortKey : max), null);
  const dayTasks = (day: LocalDate) => allTasks.filter((t) => t.doDate?.equals(day) && t.state !== "done");
  /** A drop on a day keeps the task's evening flag; a drop on the day's evening puts it there. */
  const dropOnDay = (d: AgendaDay, evening: boolean | null) => (sourceId: string) => {
    const task = findTask(sourceId);
    const toEvening = evening ?? task?.evening ?? false;
    const section = d.tasks.filter((t) => t.evening === toEvening);
    if (section.some((x) => x.id === sourceId)) return;
    void repo.placeInDay(sourceId, d.day, keyBetween(lastKey(section), null), toEvening);
  };
  const dropOnRow = (day: LocalDate, section: Task[], evening: boolean) => (sourceId: string, targetId: string, edge: Edge) => {
    const plan = planDrop(
      section.map((x) => ({ id: x.id, key: x.daySortKey })),
      sourceId,
      targetId,
      edge,
    );
    if (!plan) return;
    void (section.some((x) => x.id === sourceId) ? repo.setDayOrder(sourceId, plan.key) : repo.placeInDay(sourceId, day, plan.key, evening));
  };
  const dropOnUnplanned = (sourceId: string) => {
    if (!unplanned.some((x) => x.id === sourceId)) void repo.reschedule(sourceId, null);
  };
  /** ← / →: a day earlier or later, at the end of that day's list, never onto a day already gone. */
  const moveByDay = (id: string, delta: 1 | -1) => {
    const task = findTask(id);
    if (!task?.doDate) return;
    const target = shiftDay(task.doDate, delta, today);
    if (!target) return;
    const section = dayTasks(target).filter((t) => t.evening === task.evening);
    void repo.placeInDay(id, target, keyBetween(lastKey(section), null), task.evening);
  };

  useWeekKeys({ columns: columnsLayout ? navColumns : null, tabColumns, selectedId: sel.selectedId, select: sel.select, moveByDay, setOffset });

  // ---- the rail: a column in the wide band, a sheet below it
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => (band === "wide" ? undefined : preloadOnIdle(loadUnplannedSheet)), [band]);
  const railRef = useRef<HTMLElement>(null);
  const planYourWeek = () => {
    if (band === "wide" && railRef.current) {
      railRef.current.scrollIntoView?.({ block: "nearest", behavior: scrollMotion() });
      railRef.current.focus({ preventScroll: true });
    } else setSheetOpen(true);
  };

  // ---- rows
  const meta = (t: Task) => t.projectId && projectNames.has(t.projectId) && <span>{projectNames.get(t.projectId)}</span>;
  const projectOf = (t: Task) => (t.projectId ? projectNames.get(t.projectId) : undefined);
  const tomorrow = today.add({ days: 1 });
  const moveActions = (t: Task) => (
    <MoveActions
      onToday={t.doDate?.equals(today) ? undefined : () => void repo.reschedule(t.id, today)}
      onTomorrow={t.doDate?.equals(tomorrow) ? undefined : () => void repo.reschedule(t.id, tomorrow)}
      onSomeday={() => void repo.setState(t.id, "someday")}
    />
  );
  const fullRow = (t: Task, opts: { section?: Task[]; day?: LocalDate; actions?: boolean; footer?: ReactNode } = {}) => (
    <TaskRow
      key={t.id}
      task={t}
      today={today}
      draggable={opts.actions !== false}
      onDropTask={opts.section && opts.day ? (src, edge) => dropOnRow(opts.day as LocalDate, opts.section as Task[], t.evening)(src, t.id, edge) : undefined}
      onOpen={() => detail.open(t.id)}
      selected={sel.selectedId === t.id}
      onSelect={() => sel.select(t.id)}
      onDone={() => void repo.complete(t.id)}
      meta={meta(t)}
      onBreakDown={opts.actions === false ? undefined : () => void breakDown(t.id)}
      actions={opts.actions === false ? undefined : moveActions(t)}
      footer={opts.footer}
    />
  );
  const compactRow = (t: Task, opts: { section?: Task[]; day?: LocalDate; evening?: boolean; selectable?: boolean } = {}) => (
    <CompactRow
      key={t.id}
      task={t}
      today={today}
      selected={opts.selectable === false ? false : sel.selectedId === t.id}
      onSelect={opts.selectable === false ? undefined : () => sel.select(t.id)}
      onOpen={() => detail.open(t.id)}
      onDone={() => void repo.complete(t.id)}
      project={projectOf(t)}
      draggable={opts.selectable !== false}
      onDropTask={opts.section && opts.day ? (src, edge) => dropOnRow(opts.day as LocalDate, opts.section as Task[], opts.evening ?? false)(src, t.id, edge) : undefined}
    />
  );
  // Hidden by a start date: listed on the day it starts, collapsed; opening one is how its dates are changed.
  const startingGroup = (d: AgendaDay, compact = false) =>
    d.startingLater.length > 0 && (
      <CollapsedGroup label="Starting later" count={d.startingLater.length} onToggle={(open) => toggleStarting(d.day.toString(), open)}>
        {compact ? <ul className="flex flex-col gap-1.5">{d.startingLater.map((t) => compactRow(t))}</ul> : <TaskList>{d.startingLater.map((t) => fullRow(t, { actions: false }))}</TaskList>}
      </CollapsedGroup>
    );
  /** The thin "Due" group: listed for the deadline, not planned here, so it is not a second selection. */
  const dueGroup = (d: AgendaDay) =>
    d.due.length > 0 && (
      <div className="flex flex-col gap-1.5">
        <p className={cx(EYEBROW, "flex items-center gap-1 px-0.5")}>
          <Icon name="flag" size={12} className="shrink-0" />
          Due
        </p>
        <ul className="flex flex-col gap-1.5">{d.due.map((t) => compactRow(t, { selectable: false }))}</ul>
      </div>
    );
  const minutes = (tasks: Task[]) => formatMinutes(tasks.reduce((s, t) => s + (t.estimateMin ?? settings?.defaultEstimateMin ?? 30), 0));
  const capacityLine = (readout: DayReadout | null, d: AgendaDay) => {
    const c = capacity.byDay.get(d.day.toString());
    return readout && c ? (
      <div className="flex flex-col gap-1.5 px-0.5">
        <ReadoutText readout={readout} />
        <DayBar c={c} readout={readout} />
      </div>
    ) : null;
  };

  // ---- the phone's stacked days, under the pinned 7-day strip
  const agendaDay = (d: ColumnDay) => {
    const daytime = d.tasks.filter((t) => !t.evening);
    const evening = d.tasks.filter((t) => t.evening);
    const body = (
      <section className="flex flex-col gap-2">
        {/* The strip's jump lands here: clear of the pinned strip, and focused so the keyboard and a reader follow. */}
        <div id={agendaId(d.day)} tabIndex={-1} className="scroll-mt-24 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          <SectionLabel className="px-0.5" count={d.tasks.length > 0 ? d.tasks.length : undefined} detail={d.tasks.length > 0 ? minutes(d.tasks) : undefined}>
            {dayLabel(d)}
            {d.isToday && <span className="ml-2 font-medium normal-case tracking-normal text-ink-2">today</span>}
          </SectionLabel>
        </div>
        {capacityLine(d.readout, d)}
        {d.tasks.length === 0 ? (
          // On the title's own column, so an empty day reads as a line in the list rather than a stray note.
          <p className="pl-11 text-body text-ink-3">Free.</p>
        ) : (
          <TaskList>
            {/* A day already gone takes no drop, on its rows either. */}
            {daytime.map((t) => fullRow(t, { section: d.past ? undefined : daytime, day: d.day }))}
            {evening.map((t) => fullRow(t, { section: d.past ? undefined : evening, day: d.day }))}
          </TaskList>
        )}
        {dueGroup(d)}
        {startingGroup(d)}
      </section>
    );
    return (
      <div key={d.day.toString()} data-day={d.day.toString()}>
        {d.past ? body : <DropZone label={dayLabel(d)} onDropTask={dropOnDay(d, null)}>{body}</DropZone>}
      </div>
    );
  };
  const phoneDays = days.filter((d) => !d.past || d.tasks.length > 0 || d.due.length > 0);
  const [phoneFirst, ...phoneRest] = phoneDays;
  // A day the strip jumped to is unfolded out of its run of free days, so it has a header to land on.
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(() => new Set());
  const phoneSegments = foldFreeDays(phoneRest, (d) => d.tasks.length === 0 && d.startingLater.length === 0 && d.due.length === 0 && !unfolded.has(d.day.toString()));

  // ---- the strip: tap a day to jump to it (SCREENS.md §3 "Responsive")
  const [jump, setJump] = useState<{ iso: string; seq: number } | null>(null);
  const jumpTo = (d: StripDay) => {
    const iso = d.day.toString();
    setUnfolded((s) => (s.has(iso) ? s : new Set(s).add(iso)));
    setJump((j) => ({ iso, seq: (j?.seq ?? 0) + 1 }));
  };
  useEffect(() => {
    if (!jump) return;
    const header = document.getElementById(agendaId(localDate(jump.iso)));
    header?.scrollIntoView?.({ block: "start", behavior: scrollMotion() });
    header?.focus({ preventScroll: true });
  }, [jump]);
  const shown = new Set(phoneDays.map((d) => d.day.toString()));
  // The next seven days from today, for the sheet's per-task pickers; their bars come from the same capacity.
  const nextDays = useMemo(
    (): StripDay[] =>
      Array.from({ length: 7 }, (_, i) => {
        const day = today.add({ days: i });
        return { day, isToday: i === 0, capacity: capacity.byDay.get(day.toString()) ?? null, readout: readoutFor(day) };
      }),
    [today, capacity, readoutFor],
  );

  const railRows = unplanned.map((t) => compactRow(t));
  const stepButton = (delta: 1 | -1) => (
    <button
      type="button"
      aria-label={delta === 1 ? "Next week" : "Previous week"}
      title={delta === 1 ? "Next week (])" : "Previous week ([)"}
      disabled={delta === -1 && offset === 0}
      onClick={() => setOffset((o) => clampOffset(o + delta))}
      className={iconButtonClass()}
    >
      <Icon name={delta === 1 ? "arrow-right" : "arrow-left"} size={16} />
    </button>
  );

  return (
    <main ref={mainRef} className={cx(VIEW_COLUMN, "sm:max-w-none")}>
      <ViewHeader
        eyebrow={mode === "calendar" ? "Upcoming · calendar week" : "Upcoming · rolling 7 days"}
        title={rangeTitle(first, last, today)}
        subtitle={totalLine && <span className="num">{totalLine}</span>}
      />
      <div className="-mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Segmented
          label="Days shown"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setOffset(0);
          }}
          options={[
            { value: "rolling", label: "Next 7 days" },
            { value: "calendar", label: "Calendar week" },
          ]}
        />
        <div className="flex items-center">
          {stepButton(-1)}
          {stepButton(1)}
        </div>
        {offset > 0 && (
          <Button variant="link" size="compact" onClick={() => setOffset(0)} title="Back to this week (T)">
            <Icon name="arrow-left" size={14} />
            this week
          </Button>
        )}
        {band !== "wide" && (
          // On a phone the strip pinned above the tab bar takes its place.
          <span className={cx("ml-auto", !columnsLayout && "max-sm:hidden")}>
            <UnplannedButton count={unplanned.length} onOpen={() => setSheetOpen(true)} />
          </span>
        )}
      </div>

      {waiting ? (
        <p className={LOADING_LINE}>Getting your tasks…</p>
      ) : (
        <>
          {noneAhead && (
            <div className="flex flex-col gap-3">
              <Icon name="calendar-week" size={20} className="text-ink-3" />
              <EmptyCard
                fact="Nothing scheduled beyond today."
                action={
                  unplanned.length > 0 ? (
                    <Button variant="link" onClick={planYourWeek}>
                      Plan your week
                      <Icon name="chevron-right" size={16} className="text-ink-3" />
                    </Button>
                  ) : (
                    <Button variant="link" onClick={() => quickAdd.open()}>
                      Add a task
                      <Icon name="chevron-right" size={16} className="text-ink-3" />
                    </Button>
                  )
                }
              />
            </div>
          )}

          {columnsLayout ? (
            <WeekColumns
              band={band}
              days={days}
              selectedId={sel.selectedId}
              rail={
                band === "wide" && (
                  <div data-rail="" className="min-w-0">
                    <RailColumn count={unplanned.length} synced={synced} onDropTask={dropOnUnplanned} railRef={railRef}>
                      {railRows}
                    </RailColumn>
                  </div>
                )
              }
              renderRow={(t, d, section, evening) => compactRow(t, { section: d.past ? undefined : section, day: d.day, evening })}
              renderDue={(t) => compactRow(t, { selectable: false })}
              renderStarting={(d) => startingGroup(d, true)}
              onDropDay={dropOnDay}
              onAdd={(d) => quickAdd.open(dayPrefill(d.day, today))}
            />
          ) : (
            <>
              {/* Pinned while the agenda scrolls under it; the page's own gutter, edge to edge. */}
              <div className="sticky top-0 z-10 -mx-5 -my-3 bg-paper/95 px-5 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6">
                <DayStrip days={days} label="Jump to a day" onPick={jumpTo} isDisabled={(d) => !shown.has(d.day.toString())} />
              </div>
              {phoneFirst && agendaDay(phoneFirst)}
              {phoneSegments.map((seg) =>
                seg.kind === "day" ? (
                  agendaDay(seg.day)
                ) : (
                  <section key={seg.days[0].day.toString()} className="flex flex-col gap-2">
                    {/* The section label's shape with the dot given its own room: the glyph sits tight against a following word. */}
                    <h2 className={cx(EYEBROW, "px-0.5")}>
                      {dayLabel(seg.days[0])} – {dayLabel(seg.days[seg.days.length - 1])}
                      <span className="ml-2 font-medium normal-case tracking-normal">
                        <span className="mr-1.5 text-ink-4">·</span>free
                      </span>
                    </h2>
                    {/* Each free day keeps its readout and bar, and stays a drop target. */}
                    <div className="grid grid-cols-2 gap-2">
                      {seg.days.map((d) => (
                        <div key={d.day.toString()} data-day={d.day.toString()}>
                          <DropZone label={dayLabel(d)} onDropTask={dropOnDay(d, null)}>
                            <div className={cx("flex min-h-11 flex-col justify-center gap-1 rounded-xl border bg-surface px-3 py-2", dragging ? "border-dashed border-line-strong" : "border-line")}>
                              <span className="text-body-sm font-medium text-ink-2 num">{dayLabel(d)}</span>
                              {d.readout && d.capacity && (
                                <>
                                  <ReadoutText readout={d.readout} />
                                  <DayBar c={d.capacity} readout={d.readout} />
                                </>
                              )}
                            </div>
                          </DropZone>
                        </div>
                      ))}
                    </div>
                  </section>
                ),
              )}
              {/* "Not yet planned" is the strip pinned above the tab bar (SCREENS.md §3); a narrow window keeps its button. */}
              {unplanned.length > 0 && <UnplannedStrip count={unplanned.length} onOpen={() => setSheetOpen(true)} className="sm:hidden" />}
            </>
          )}

          {/* Past the week the agenda keeps going below it (SCREENS.md §6), by month group, then by day. */}
          {later.map((g) => (
            <section key={g.key} className="flex flex-col gap-3">
              <SectionLabel className="px-0.5" count={g.days.reduce((n, d) => n + d.tasks.length, 0) || undefined}>
                {g.label}
              </SectionLabel>
              {g.days.map((d) => {
                const readout = compareDates(d.day, readoutEnd) <= 0 ? readoutFor(d.day) : null;
                const daytime = d.tasks.filter((t) => !t.evening);
                const evening = d.tasks.filter((t) => t.evening);
                return (
                  <div key={d.day.toString()} data-day={d.day.toString()}>
                    <DropZone label={formatDay(d.day, { today })} onDropTask={dropOnDay(d, null)}>
                      <div className="flex flex-col gap-2">
                        <h3 className="flex flex-wrap items-baseline gap-x-2 px-0.5 text-body-sm font-medium text-ink-2 num">
                          <span>
                            {formatDay(d.day, { today })}
                            {d.tasks.length > 0 && <span className="font-normal text-ink-3"> · {minutes(d.tasks)}</span>}
                          </span>
                          {/* A compact readout while the day is within the next two weeks. */}
                          {readout && <ReadoutText readout={readout} />}
                        </h3>
                        {d.tasks.length > 0 && (
                          <TaskList>
                            {daytime.map((t) => fullRow(t, { section: daytime, day: d.day }))}
                            {evening.map((t) => fullRow(t, { section: evening, day: d.day }))}
                          </TaskList>
                        )}
                        {dueGroup(d)}
                        {startingGroup(d)}
                      </div>
                    </DropZone>
                  </div>
                );
              })}
            </section>
          ))}
        </>
      )}
      {sheetOpen && <UnplannedSheet tasks={unplanned} days={nextDays} today={today} row={(t, footer) => fullRow(t, { footer })} onClose={() => setSheetOpen(false)} />}
    </main>
  );
}
