"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@/data/powersync";
import { blockLength, chooseSlot, placeAt } from "@/core/blocking";
import { keyBetween } from "@/core/ordering";
import { Temporal, formatMinutes, formatTime, instant, timeFromMinutes, toInstant, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import { normaliseTimestamp, toTask } from "@/data/mappers";
import { DAY_PLAN_SQL, DONE_BETWEEN_SQL, OPEN_TASKS_SQL, monthsBack } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useBlocking } from "@/features/blocking/blocking-provider";
import { useBlockRepo } from "@/features/blocking/use-block-repo";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useCarryReview } from "@/features/rituals/carry-review-host";
import { plannedLabel, pullInSuggestions } from "@/features/rituals/morning-plan";
import { closedLine } from "@/features/rituals/shutdown";
import { PLAN_LABEL, planMode } from "@/features/planning/drawing";
import { LazyPlanIsland, usePlanPreview } from "@/features/planning/use-plan-preview";
import { Ribbon } from "@/features/today/ribbon";
import { Timeline } from "@/features/today/timeline";
import { ViewHeader } from "@/features/shell/view-header";
import { BLOCK_GLYPH, CarryAsk, MoveActions, RowAction } from "@/features/tasks/task-actions";
import { useListSelection } from "@/features/selection/selection-provider";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { planDrop, type Edge } from "@/features/tasks/reorder";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useToday, type TimelineBlock } from "@/features/today/hooks/use-today";
import { buttonClass } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { SectionAction, SectionLabel } from "@/ui/section-label";
import { Segmented } from "@/ui/segmented";
import { Loading } from "../loading-view";

const NOTHING_SQL = `select * from tasks where 0`;
const USER_SQL = `select id, personal_space_id from users limit 1`;

/** The eyebrow's second word: morning until noon, evening from the hour the person set (DESIGN_SYSTEM.md §5). */
function partOfDay(minute: number, eveningAt: number): "Morning" | "Afternoon" | "Evening" {
  if (minute < 12 * 60) return "Morning";
  return minute < eveningAt ? "Afternoon" : "Evening";
}

/** The chip a blocked task carries in the list (SCREENS.md §2.6 "a small block indicator"); it stands in for the do-time chip. */
function BlockChip({ block }: { block: TimelineBlock }) {
  return (
    <Chip tone="block" size="auto" title={`Blocked ${formatTime(timeFromMinutes(block.start))}–${formatTime(timeFromMinutes(block.end))}`}>
      {formatTime(timeFromMinutes(block.start))}
    </Chip>
  );
}

/** A ritual link: "Morning plan ›", "Shutdown ›". 44 px on the phone's ritual row, 36 px in the desktop header. */
function RitualLink({ href, quiet = false, className, children }: { href: string; quiet?: boolean; className?: string; children: string }) {
  return (
    <Link href={href} className={cx(buttonClass({ variant: "link" }), quiet && "text-ink-2", className)}>
      {children}
      <Icon name="chevron-right" size={16} className="text-ink-3" />
    </Link>
  );
}

/**
 * Measures repository call → the React commit that shows the new data, for
 * Appendix A1. Results collect on window.__sparehourTimings. Commit-based
 * rather than rAF-based so a background tab (throttled rAF) measures the same.
 */
let lastCommit = 0;
function useInteractionTimer() {
  return useCallback(async (label: string, action: () => Promise<void>) => {
    const t0 = performance.now();
    await action();
    const written = performance.now();
    while (lastCommit < written && performance.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 2));
    const ms = performance.now() - t0;
    const w = window as unknown as { __sparehourTimings?: { label: string; writeMs: number; ms: number }[] };
    (w.__sparehourTimings ??= []).push({ label, writeMs: Math.round(written - t0), ms: Math.round(ms) });
  }, []);
}

export default function TodayPage() {
  const [now, setNow] = useState(() => Temporal.Now.instant());
  useEffect(() => {
    const id = setInterval(() => setNow(Temporal.Now.instant()), 60_000);
    return () => clearInterval(id);
  }, []);
  const model = useToday(now);
  const detail = useTaskDetail();
  const review = useCarryReview();
  const sel = useListSelection([model.carried.map((t) => t.id), model.todayTasks.map((t) => t.id), model.eveningTasks.map((t) => t.id)]);
  const time = useInteractionTimer();
  useEffect(() => {
    lastCommit = performance.now();
  }, [model.todayTasks, model.carried]);

  const zone = model.settings?.timezone ?? "UTC";
  const tomorrow: LocalDate = model.today.add({ days: 1 });

  // ---- time blocks (SCREENS.md §2.6): local for now, on the calendar with P7b.
  const blocks = useBlockRepo();
  const blocking = useBlocking();
  const projectNames = useProjectNames();
  const { data: users } = useQuery<{ id: string; personal_space_id: string | null }>(USER_SQL);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "day">("list");
  const windows = model.capacity?.windows ?? [];
  const dayStart = windows[0]?.start ?? 9 * 60;
  const dayEnd = windows[windows.length - 1]?.end ?? 17 * 60;
  const defaultEstimate = model.settings?.defaultEstimateMin ?? 30;
  const nowMinute = (() => {
    const z = now.toZonedDateTimeISO(zone);
    return z.hour * 60 + z.minute;
  })();
  const atMinute = useCallback(
    (minute: number) => (minute >= 24 * 60 ? toInstant(tomorrow, timeFromMinutes(0), zone) : toInstant(model.today, timeFromMinutes(minute), zone)).toString(),
    [model.today, tomorrow, zone],
  );
  const findTask = (id: string): Task | undefined => [...model.carried, ...model.todayTasks, ...model.eveningTasks].find((t) => t.id === id);
  const placeTask = async (task: Task, startMin: number) => {
    const existing = model.blockByTask.get(task.id);
    const len = existing ? existing.end - existing.start : blockLength(task.estimateMin, defaultEstimate);
    const at = placeAt(startMin, len);
    if (existing) {
      await blocks.move(existing.id, atMinute(at.start), atMinute(at.end));
      setSelectedBlockId(existing.id);
      return;
    }
    const user = users?.[0];
    if (!user?.personal_space_id) return;
    const id = await blocks.create({ spaceId: user.personal_space_id, userId: user.id, taskId: task.id, title: task.title, startAt: atMinute(at.start), endAt: atMinute(at.end) });
    setSelectedBlockId(id);
  };
  // `B`, the palette and the detail's "Block it": the next free gap that fits, from now.
  const blockInNextGap = (taskId: string) => {
    const task = findTask(taskId);
    if (!task) return;
    setView("day");
    const existing = model.blockByTask.get(task.id);
    if (existing) {
      setSelectedBlockId(existing.id);
      return;
    }
    const slot = chooseSlot(model.capacity?.free ?? [], Math.max(nowMinute, dayStart), blockLength(task.estimateMin, defaultEstimate), dayEnd);
    void placeTask(task, slot.start);
  };
  const blockInNextGapRef = useRef(blockInNextGap);
  useEffect(() => {
    blockInNextGapRef.current = blockInNextGap;
  });
  useEffect(() => blocking.register((id) => blockInNextGapRef.current(id)), [blocking]);
  // Tap-to-schedule (SCREENS.md §2.8): "Block…" on a row, then a tap on the timeline; Escape lets go.
  const [placingId, setPlacingId] = useState<string | null>(null);
  const placingTask = placingId ? findTask(placingId) : undefined;
  const startPlacing = (id: string) => {
    setPlacingId(id);
    setView("day");
  };
  useEffect(() => {
    if (!placingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPlacingId(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [placingId]);
  // Plan my day (SCREENS.md §2.1, §2.6): the preview shows the Day view with the proposal drawn on it, nothing written until Approve.
  const planning = usePlanPreview(() => {
    setView("day");
    setSelectedBlockId(null);
    setPlacingId(null);
    detail.close();
  });
  // Once per preview, the first proposed block is brought into view: in the day pane from the wide band, above the sheet on a phone.
  // Between those the panel sits above the timeline in one column, and scrolling would carry its buttons away.
  const firstGhost = planning.drawing?.ghosts[0]?.key ?? null;
  const shownGhostFor = useRef<string | null>(null);
  useEffect(() => {
    if (!planning.mode) {
      shownGhostFor.current = null;
      return;
    }
    if (!firstGhost || shownGhostFor.current) return;
    shownGhostFor.current = firstGhost;
    if (!window.matchMedia?.("(min-width: 1180px), (max-width: 639px)").matches) return;
    document.querySelector("[data-plan-ghost]")?.scrollIntoView?.({ block: "start" });
  }, [planning.mode, firstGhost]);
  const selectedBlock = model.blocks.find((b) => b.id === selectedBlockId) ?? null;
  const removeBlock = (id: string) => {
    setSelectedBlockId((s) => (s === id ? null : s));
    void blocks.remove(id);
  };
  // With a block selected: L locks, Backspace/Delete removes, Escape lets go (before the task shortcuts see the key).
  useEffect(() => {
    if (!selectedBlock) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "l" || e.key === "L") void blocks.setLocked(selectedBlock.id, !selectedBlock.locked);
      else if (e.key === "Backspace" || e.key === "Delete") removeBlock(selectedBlock.id);
      else if (e.key === "Escape") setSelectedBlockId(null);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // The day's ritual state (SCREENS.md §2.1, §15): once shut down, the ribbon gives way to the day's summary.
  const todayIso = model.today.toString();
  const { data: planRows } = useQuery<{ shutdown_at: string | null; planned_at: string | null; highlights: string | null; day_rating: number | null }>(DAY_PLAN_SQL, [todayIso]);
  const plan = planRows?.[0] ?? null;
  const localTimeOf = (iso: string) => formatTime(instant(normaliseTimestamp(iso)).toZonedDateTimeISO(zone).toPlainTime());
  const closedAt = plan?.shutdown_at ? localTimeOf(plan.shutdown_at) : null;
  const plannedAt = plan?.planned_at ? localTimeOf(plan.planned_at) : null;
  const emptyDay = model.ready && !closedAt && model.carried.length === 0 && model.todayTasks.length === 0;
  const { data: openRows } = useQuery<TaskRowType>(emptyDay ? OPEN_TASKS_SQL : NOTHING_SQL);
  const suggestions = useMemo(() => (emptyDay ? pullInSuggestions((openRows ?? []).map(toTask), model.today) : []), [emptyDay, openRows, model.today]);
  const dayBounds = useMemo(() => {
    const start = model.today.toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from("00:00") }).toInstant().toString();
    const end = tomorrow.toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from("00:00") }).toInstant().toString();
    return [start, end] as [string, string];
  }, [model.today, tomorrow, zone]);
  const months = useMemo(() => monthsBack(model.today, 1), [model.today]);
  const { data: doneRows } = useQuery<TaskRowType>(closedAt ? DONE_BETWEEN_SQL : NOTHING_SQL, closedAt ? dayBounds : [], {
    streams: closedAt ? [{ name: "logbook", parameters: { months }, ttl: 60 * 60 }] : undefined,
  });
  const doneToday = useMemo(() => (doneRows ?? []).map(toTask), [doneRows]);
  const shutdownReady = !model.capacity || model.capacity.state === "no_work_day" || nowMinute >= model.capacity.windows[model.capacity.windows.length - 1].end - 120;

  const move = (t: Task, dir: -1 | 1) => {
    const list = model.todayTasks;
    const i = list.findIndex((x) => x.id === t.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const before = dir === -1 ? list[j - 1] : list[j];
    const after = dir === -1 ? list[j] : list[j + 1];
    const key = keyBetween(before?.daySortKey ?? null, after?.daySortKey ?? null);
    void time("reorder", () => model.repo.setDayOrder(t.id, key));
  };
  // A row dropped above or below another: reordered within its list, or pulled
  // into it from Carried over / This evening (one statement either way).
  const dropInto = (list: Task[], evening: boolean) => (sourceId: string, targetId: string, edge: Edge) => {
    const plan = planDrop(
      list.map((x) => ({ id: x.id, key: x.daySortKey })),
      sourceId,
      targetId,
      edge,
    );
    if (!plan || !findTask(sourceId)) return;
    const inList = list.some((x) => x.id === sourceId);
    void time("reorder", () => (inList ? model.repo.setDayOrder(sourceId, plan.key) : model.repo.placeInDay(sourceId, model.today, plan.key, evening)));
  };
  const dropInToday = dropInto(model.todayTasks, false);
  const dropInEvening = dropInto(model.eveningTasks, true);

  if (!model.ready) return <Loading />;

  const hasDay = Boolean(model.capacity && model.capacity.state !== "no_work_day");
  const showDay = hasDay && view === "day";
  const finish = model.capacity?.projectedFinish ?? null;
  // The phone's ritual row turns to the shutdown once the plan is projected to be done, or the day is two hours from its end.
  const shutdownTime = shutdownReady || (finish !== null && nowMinute >= finish.hour * 60 + finish.minute);
  const sectionMinutes = (list: Task[]) => formatMinutes(list.reduce((s, t) => s + (t.estimateMin ?? defaultEstimate), 0));
  // The project name in the row's quiet run, as on every other cross-project list (DESIGN_SYSTEM.md §5 "Task row").
  const meta = (t: Task) => t.projectId && projectNames.has(t.projectId) && <span>{projectNames.get(t.projectId)}</span>;
  const eveningAt = model.settings ? model.settings.eveningStartsAt.hour * 60 + model.settings.eveningStartsAt.minute : 18 * 60;
  // Past the working day: the ritual row says so even when there is no projected finish left to name.
  const dayOver = hasDay && nowMinute >= dayEnd;
  // Once the day has started and the plan has put blocks on it, the button offers to re-plan what is left.
  const nextPlan = planMode(nowMinute, dayStart, model.blocks.some((b) => b.source === "plan"));
  const drawing = planning.drawing;
  const replacedIds = new Set(drawing?.replacedIds ?? []);

  return (
    // Three panes from the wide band: the list column scrolls on its own and the day pane keeps its place beside it.
    // Below that the day pane takes the list's place when "Day" is chosen, and the page (or the shell's region) scrolls.
    <main className="flex w-full flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
      {/* Below the wide band the Day view replaces only the lists: the header, the hero and the ritual row (with the List/Day control) stay. */}
      <div className={cx("flex min-w-0 flex-col gap-6 px-5 py-6 sm:px-6 md:max-w-210 md:px-10 md:py-7 lg:min-h-0 lg:flex-1 lg:overflow-y-auto", showDay ? "pb-0 lg:pb-7" : "flex-1")}>
        <ViewHeader
          eyebrow={`Today · ${partOfDay(nowMinute, eveningAt)}`}
          title={formatDay(model.today, { weekday: "long", month: "long" })}
          actions={
            !closedAt && (
              // From the narrow band up the rituals live here; the phone has its own row under the hero.
              <>
                {review && review.carried > 0 && (
                  // The morning review, on demand: the same sheet the first open of the day offers (SCREENS.md §2.3a).
                  <button type="button" onClick={review.open} className={cx(buttonClass({ variant: "link" }), "text-ink-2 max-sm:hidden")}>
                    Review carried
                  </button>
                )}
                {plannedAt ? (
                  <span className="hidden h-9 items-center px-2 text-label text-ink-3 num sm:flex">{plannedLabel(plannedAt)}</span>
                ) : (
                  <RitualLink href="/plan" className="max-sm:hidden">
                    Morning plan
                  </RitualLink>
                )}
                {hasDay && (
                  <button type="button" aria-expanded={planning.mode !== null} onClick={() => planning.open(nextPlan)} className={cx(buttonClass({ variant: "link" }), "max-sm:hidden")}>
                    {PLAN_LABEL[nextPlan]}
                  </button>
                )}
                <RitualLink href="/shutdown" quiet={!shutdownReady} className="max-sm:hidden">
                  Shutdown
                </RitualLink>
              </>
            )
          }
        />

        {closedAt ? (
          <div className="rounded-xl border border-line bg-surface px-5 py-5">
            <p className="font-display text-pane font-medium text-ink">That&rsquo;s the day.</p>
            <p className="mt-1.5 text-body-sm text-ink-2 num">{closedLine(doneToday, defaultEstimate, closedAt, plan?.day_rating ?? null)}</p>
            {plan?.highlights && <p className="mt-2 text-body text-pretty text-ink-2">Worth it: {plan.highlights}</p>}
          </div>
        ) : (
          model.capacity && (
            <>
              {model.calendarIssue && (
                <p role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-body-sm text-ink-2">
                  <span>{model.calendarIssue.message}</span>
                  <Link href="/settings#calendar" className="text-ink underline decoration-line-strong underline-offset-2">
                    {model.calendarIssue.kind === "reauth" ? "Reconnect" : "Retry"}
                  </Link>
                </p>
              )}
              <Ribbon c={model.capacity} nowMin={nowMinute} connected={model.calendarConnected} />
            </>
          )
        )}

        {/* The ritual row (DESIGN_SYSTEM.md §5): on the phone the ritual of the hour with its status, "Morning plan" until the day
            nears its end and "Shutdown" from then on, with the List | Day control to its right, dropping to its own line only below
            390 px. Above the phone the rituals sit in the header and only the control remains here, until the wide band shows both panes. */}
        {(hasDay || !closedAt) && (
          <div className="-my-3 flex flex-wrap items-center gap-x-2 lg:hidden">
            {!closedAt &&
              (shutdownTime ? (
                <span className="-ml-2 flex items-center gap-1 sm:hidden">
                  <RitualLink href="/shutdown">Shutdown</RitualLink>
                  {finish ? <span className="text-label text-ink-3 num">done by {formatTime(finish)}</span> : dayOver ? <span className="text-label text-ink-3">Day&rsquo;s over</span> : null}
                </span>
              ) : (
                <span className="-ml-2 flex items-center gap-1 sm:hidden">
                  {plannedAt ? (
                    <span className="px-2 text-label text-ink-3 num">{plannedLabel(plannedAt)}</span>
                  ) : (
                    <>
                      <RitualLink href="/plan">Morning plan</RitualLink>
                      <span className="text-label text-ink-3">Not planned yet</span>
                    </>
                  )}
                </span>
              ))}
            {!closedAt && hasDay && (
              <button type="button" aria-expanded={planning.mode !== null} onClick={() => planning.open(nextPlan)} className={cx(buttonClass({ variant: "link" }), "sm:hidden")}>
                {PLAN_LABEL[nextPlan]}
              </button>
            )}
            {!closedAt && review && review.carried > 0 && (
              <button type="button" onClick={review.open} className={cx(buttonClass({ variant: "link" }), "text-ink-2 sm:hidden")}>
                Review carried
              </button>
            )}
            {hasDay && (
              <Segmented
                className="ml-auto"
                options={[
                  { value: "list", label: "List" },
                  { value: "day", label: "Day" },
                ]}
                value={view}
                onChange={setView}
              />
            )}
          </div>
        )}

        {planning.mode && !closedAt && (
          // Beside the timeline from the wide band, above it below that, and a sheet over the Day view on a phone.
          <LazyPlanIsland mode={planning.mode} model={model} now={now} layout="dock" onDrawing={planning.setDrawing} onClose={planning.close} />
        )}

        <div className={cx("flex-col gap-6", planning.mode && !closedAt ? "hidden" : showDay ? "hidden lg:flex" : "flex")}>
          {model.carried.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionLabel
                className="px-0.5"
                count={model.carried.length}
                action={
                  <SectionAction onClick={() => void time("clear-the-slate", () => model.repo.archiveMany(model.carried.map((t) => t.id)))} title="Archive everything carried over — one undo brings it all back">
                    Clear the slate
                  </SectionAction>
                }
              >
                Carried over
              </SectionLabel>
              <TaskList>
                {model.carried.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    today={model.today}
                    draggable
                    timeChip={model.blockByTask.has(t.id) && <BlockChip block={model.blockByTask.get(t.id)!} />}
                    meta={meta(t)}
                    onOpen={() => detail.open(t.id)}
                    selected={sel.selectedId === t.id}
                    onSelect={() => sel.select(t.id)}
                    onDone={() => void time("complete", () => model.repo.complete(t.id))}
                    actions={
                      <MoveActions
                        onToday={() => void time("reschedule", () => model.repo.reschedule(t.id, model.today))}
                        onTomorrow={() => void time("reschedule", () => model.repo.reschedule(t.id, tomorrow))}
                        onSomeday={() => void time("someday", () => model.repo.setState(t.id, "someday"))}
                        onDrop={() => void time("drop", () => model.repo.setState(t.id, "dropped"))}
                      />
                    }
                    footer={
                      t.ask && (
                        <CarryAsk
                          count={t.carryCount}
                          onKeep={() => void time("keep", () => model.repo.reschedule(t.id, model.today))}
                          onSomeday={() => void time("someday", () => model.repo.setState(t.id, "someday"))}
                          onDrop={() => void time("drop", () => model.repo.setState(t.id, "dropped"))}
                        />
                      )
                    }
                  />
                ))}
              </TaskList>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <SectionLabel className="px-0.5" count={model.todayTasks.length} detail={sectionMinutes(model.todayTasks)}>
              Today
            </SectionLabel>
            <TaskList>
              {model.todayTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  today={model.today}
                  draggable
                  onDropTask={(src, edge) => dropInToday(src, t.id, edge)}
                  timeChip={model.blockByTask.has(t.id) && <BlockChip block={model.blockByTask.get(t.id)!} />}
                  meta={meta(t)}
                  onOpen={() => detail.open(t.id)}
                  selected={sel.selectedId === t.id}
                  onSelect={() => sel.select(t.id)}
                  onDone={() => void time("complete", () => model.repo.complete(t.id))}
                  actions={
                    <>
                      <RowAction label="Move up" text={null} icon="arrow-up" onClick={() => move(t, -1)} />
                      <RowAction label="Move down" text={null} icon="arrow-down" onClick={() => move(t, 1)} />
                      <RowAction label="Tomorrow" text="Tmr" icon="arrow-right" title="Tomorrow (Shift+T)" onClick={() => void time("reschedule", () => model.repo.reschedule(t.id, tomorrow))} />
                      {hasDay && !model.blockByTask.has(t.id) && (
                        <RowAction label={`Block ${t.title}`} text="Block" glyph={BLOCK_GLYPH} title="Pick a time on the timeline" onClick={() => startPlacing(t.id)} />
                      )}
                    </>
                  }
                />
              ))}
              {model.todayTasks.length === 0 && !emptyDay && <li className="px-4 py-3 text-body-lg text-ink-3">Nothing planned yet.</li>}
              {emptyDay && (
                // The returning-user empty day (ONBOARDING.md §4): a planning prompt, not an empty illustration.
                <li className="flex flex-col items-start gap-4 px-4 py-5 sm:px-5">
                  <p className="font-display text-pane font-medium text-pretty text-ink">
                    Nothing planned for today.
                    {model.capacity && model.capacity.state !== "no_work_day" && model.capacity.spareMin > 0 && <> You have {formatMinutes(model.capacity.spareMin)}.</>}
                  </p>
                  <Link href="/plan" className={cx(buttonClass({ variant: "primary" }), "w-full sm:w-auto")}>
                    Plan my day · 2 min
                  </Link>
                  {suggestions.length > 0 && (
                    <div className="flex w-full flex-col gap-2">
                      <p className="text-body-sm text-ink-2">or pull something in:</p>
                      <TaskList>
                        {suggestions.map(({ task: t, source }) => (
                          <TaskRow
                            key={t.id}
                            task={t}
                            today={model.today}
                            onOpen={() => detail.open(t.id)}
                            meta={source !== "deadline" && <span>{source}</span>}
                            actions={<MoveActions onToday={() => void time("reschedule", () => model.repo.reschedule(t.id, model.today))} />}
                          />
                        ))}
                      </TaskList>
                    </div>
                  )}
                  <p className="text-body-sm text-ink-3">Or just start typing.</p>
                </li>
              )}
            </TaskList>
          </section>

          {model.eveningTasks.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionLabel className="px-0.5" count={model.eveningTasks.length} detail={sectionMinutes(model.eveningTasks)}>
                This evening
              </SectionLabel>
              <TaskList>
                {model.eveningTasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    today={model.today}
                    draggable
                    onDropTask={(src, edge) => dropInEvening(src, t.id, edge)}
                    timeChip={model.blockByTask.has(t.id) && <BlockChip block={model.blockByTask.get(t.id)!} />}
                    meta={meta(t)}
                    onOpen={() => detail.open(t.id)}
                    selected={sel.selectedId === t.id}
                    onSelect={() => sel.select(t.id)}
                    onDone={() => void time("complete", () => model.repo.complete(t.id))}
                  />
                ))}
              </TaskList>
            </section>
          )}
        </div>
      </div>

      {model.capacity && hasDay && (
        // "Your day": a card in the list's place below the wide band; from it, a surface pane under the daylight gradient
        // that spans the region's height beside the list and scrolls on its own only when the day is taller than the screen.
        <aside
          aria-label="Your day"
          // The pane scrolls on its own from the wide band, so a keyboard user can focus it to scroll a day with nothing to focus.
          tabIndex={0}
          className={cx(
            "w-full flex-col px-5 pb-6 outline-none sm:px-6 md:px-10 md:pb-7 lg:focus-visible:outline-2 lg:focus-visible:-outline-offset-2 lg:focus-visible:outline-ink",
            "lg:ml-auto lg:h-full lg:w-86 lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-line lg:bg-surface lg:bg-daylight lg:px-5 lg:py-7",
            showDay ? "flex" : "hidden",
            detail.selectedId ? "lg:hidden" : "lg:flex",
            // Room to scroll the whole day above the docked preview sheet.
            planning.mode && "max-sm:pb-[min(62dvh,36rem)]",
          )}
        >
          <div className="rounded-xl border border-line bg-surface bg-daylight px-4 pt-4 pb-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:bg-none lg:p-0">
            <h2 className="font-display text-pane font-medium text-ink">Your day</h2>
            <p className="mt-1 mb-4.5 text-body-sm text-ink-3 num">
              {formatTime(timeFromMinutes(dayStart))} – {formatTime(timeFromMinutes(dayEnd))} · buffer {model.settings?.bufferPct}%
            </p>
            {placingTask && (
              <div role="status" className="mb-3 flex min-h-11 items-center justify-between gap-3 rounded-lg bg-ink px-3 py-1.5 text-body-sm text-ink-inverse sm:min-h-9">
                <span className="min-w-0 truncate">Tap a time for “{placingTask.title}”</span>
                <button type="button" onClick={() => setPlacingId(null)} className="flex h-11 shrink-0 items-center rounded-sm px-2 font-medium underline decoration-ink-inverse/50 hover:decoration-ink-inverse sm:h-7">
                  Cancel
                </button>
              </div>
            )}
            <Timeline
              // While previewing, the gaps are what the proposal leaves; the "done by" marker belongs to the day as it is, so it steps aside.
              c={drawing ? { ...model.capacity, free: [...drawing.free], projectedFinish: null } : model.capacity}
              now={now}
              zone={zone}
              blocks={drawing ? model.blocks.filter((b) => !replacedIds.has(b.id)) : model.blocks}
              proposed={drawing?.ghosts}
              meetings={model.meetings}
              defaultEstimateMin={defaultEstimate}
              selectedBlockId={selectedBlockId}
              onSelectBlock={setSelectedBlockId}
              onDropTask={(taskId, startMin) => {
                const task = findTask(taskId);
                if (task) void placeTask(task, startMin);
              }}
              onMoveBlock={(id, startMin) => {
                const b = model.blocks.find((x) => x.id === id);
                if (!b) return;
                const at = placeAt(startMin, b.end - b.start);
                void blocks.move(id, atMinute(at.start), atMinute(at.end));
              }}
              onResizeBlock={(id, endMin) => {
                const b = model.blocks.find((x) => x.id === id);
                if (b && endMin !== b.end) void blocks.move(id, atMinute(b.start), atMinute(endMin));
              }}
              onRemoveBlock={removeBlock}
              onToggleLock={(id, locked) => void blocks.setLocked(id, locked)}
              onOpenTask={(taskId) => detail.open(taskId)}
              placing={placingTask ? { title: placingTask.title } : null}
              onTapSlot={(min) => {
                if (!placingTask) return;
                void placeTask(placingTask, min);
                setPlacingId(null);
              }}
            />
            {model.blocks.length === 0 && !placingTask && !planning.mode && (
              <p className="mt-4 text-body-sm text-pretty text-ink-3">
                <span className="max-sm:hidden">Drag a task here, tap “Block” on a row and then a time, or select a task and press B.</span>
                <span className="sm:hidden">Tap “Block” on a task, then a time here.</span>
              </p>
            )}
          </div>
        </aside>
      )}
    </main>
  );
}
