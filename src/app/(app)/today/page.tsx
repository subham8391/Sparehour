"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { blockLength, chooseSlot, placeAt } from "@/core/blocking";
import { keyBetween } from "@/core/ordering";
import { Temporal, formatMinutes, formatTime, instant, timeFromMinutes, toInstant, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { sortToday, type TodaySort } from "@/core/today/sort";
import type { Task } from "@/core/types";
import { normaliseTimestamp, toTask } from "@/data/mappers";
import { DAY_PLAN_SQL, DONE_BETWEEN_SQL, OPEN_TASKS_SQL, monthsBack } from "@/data/queries/views";
import { SettingsRepo, type SettingsPatch } from "@/data/repositories/settings-repo";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useBlocking } from "@/features/blocking/blocking-provider";
import { useBlockRepo } from "@/features/blocking/use-block-repo";
import { useBlockNudgePending } from "@/features/notifications/block-nudge-store";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useCarryReview } from "@/features/rituals/carry-review-host";
import { easiestMove, plannedLabel, pullInSuggestions } from "@/features/rituals/morning-plan";
import { useTomorrowSpare } from "@/features/rituals/use-tomorrow-spare";
import { closedLine } from "@/features/rituals/shutdown";
import { PLAN_LABEL, planMode } from "@/features/planning/drawing";
import { LazyPlanIsland, usePlanPreview } from "@/features/planning/use-plan-preview";
import { Ribbon, heroState } from "@/features/today/ribbon";
import { dayState } from "@/features/today/day-state";
import { registerTodayHandler, type TodayRequest } from "@/features/today/today-request";
import { RitualLink, RitualRow, type TodayView } from "@/features/today/ritual-row";
import { Timeline } from "@/features/today/timeline";
import { useHideQuickAddFab } from "@/features/shell/fab-visibility";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { ViewHeader } from "@/features/shell/view-header";
import { BLOCK_GLYPH, CarryAsk, MenuOnly, MoveActions, RowAction } from "@/features/tasks/task-actions";
import { useConvertToProject } from "@/features/tasks/use-convert";
import { useRecordAsks } from "@/features/rollover/use-carry-asks";
import { useListSelection } from "@/features/selection/selection-provider";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { planDrop, type Edge } from "@/features/tasks/reorder";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useToday, type TimelineBlock } from "@/features/today/hooks/use-today";
import { buttonClass } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { MenuButton } from "@/ui/popover";
import { EYEBROW, SectionAction, SectionLabel } from "@/ui/section-label";
import { Toast } from "@/ui/toast";
import { Loading } from "../loading-view";

// The once-only expired digest (PRODUCT_SPEC.md §8.2 rule 5): a lazy island, out of the first download.
const ExpiredDigest = dynamic(() => import("@/features/today/expired-digest"), { ssr: false });
// "Want a nudge when this starts?" after the first block on a device not yet asked (PRODUCT_SPEC.md §14 rule 7): loaded only then.
const BlockNudge = dynamic(() => import("@/features/notifications/block-nudge"), { ssr: false });
// Today's ⋯ contents and the Trim today panel (SCREENS.md §2.1, PRODUCT_SPEC.md §9.4): out of the shell, fetched on idle.
const loadTodayMenu = () => import("@/features/today/today-menu");
const loadTrimToday = () => import("@/features/today/trim-today");
// Clear the slate's confirmation (PRODUCT_SPEC.md §8.5): its scopes, counts and the batch write, out of the shell.
const loadClearSlate = () => import("@/features/archive/clear-slate-sheet");
const TodayMenu = dynamic(loadTodayMenu, { ssr: false });
const TrimToday = dynamic(loadTrimToday, { ssr: false });
const ClearSlate = dynamic(loadClearSlate, { ssr: false });
const preloadTodayIslands = () => Promise.all([loadTodayMenu(), loadTrimToday(), loadClearSlate()]);
/** Above this many rows Carried over starts folded to one line (SCREENS.md §2.3); unfolding holds for the day. */
const CARRIED_FOLD_AT = 8;
const CARRIED_OPEN_KEY = "sparehour:carried-open";
function readCarriedOpen(day: string): boolean {
  try {
    return localStorage.getItem(CARRIED_OPEN_KEY) === day;
  } catch {
    return false;
  }
}
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
  const time = useInteractionTimer();
  useEffect(() => {
    lastCommit = performance.now();
  }, [model.todayTasks, model.carried]);

  const zone = model.settings?.timezone ?? "UTC";
  const tomorrow: LocalDate = model.today.add({ days: 1 });
  const db = useLocalDatabase();
  useEffect(() => preloadOnIdle(preloadTodayIslands), []);
  // Convert task → project ("Break it down", the row's menu): the project opens with the cursor in its add row.
  const breakDown = useConvertToProject(model.repo, detail.close);

  // Today's view preferences (⋯ Sort, Show completed): one setting each, also in Settings › Planning. The choice
  // shows at once and stays until the settings row says the same.
  const [prefs, setPrefs] = useState<SettingsPatch>({});
  if (model.settings && Object.keys(prefs).length > 0 && (prefs.todaySort ?? model.settings.todaySort) === model.settings.todaySort && (prefs.showCompleted ?? model.settings.showCompleted) === model.settings.showCompleted) setPrefs({});
  const sort: TodaySort = prefs.todaySort ?? model.settings?.todaySort ?? "manual";
  const showCompleted = prefs.showCompleted ?? model.settings?.showCompleted ?? false;
  const savePref = (patch: SettingsPatch) => {
    setPrefs((p) => ({ ...p, ...patch }));
    if (model.settingsId) void new SettingsRepo(db).update(model.settingsId, patch);
  };
  // Sort is a view over the two lists (SCREENS.md §2.4): a sorted copy, never a rewritten day_sort_key.
  const todayList = sortToday(model.todayTasks, sort, model.settings?.defaultEstimateMin ?? 30);
  const eveningList = sortToday(model.eveningTasks, sort, model.settings?.defaultEstimateMin ?? 30);
  const [trimOpen, setTrimOpen] = useState(false);
  const [slateOpen, setSlateOpen] = useState(false);
  // A short confirmation the ⋯ menu leaves behind ("Copied today as text"); it reports, it has nothing to undo.
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  // The palette's Trim today, Sort by… and Show completed (features/today/today-request.ts).
  const onRequest = useRef<(r: TodayRequest) => void>(() => undefined);
  useEffect(() => {
    onRequest.current = (r) => {
      if (r.kind === "trim") setTrimOpen(true);
      else if (r.kind === "sort") savePref({ todaySort: r.sort });
      else savePref({ showCompleted: !showCompleted });
    };
  });
  useEffect(() => registerTodayHandler((r) => onRequest.current(r)), []);
  // Above eight rows Carried over starts folded; unfolding it holds for the rest of the day on this device.
  const [carriedOpenOn, setCarriedOpenOn] = useState<string | null>(null);
  const todayIsoNow = model.today.toString();
  const carriedFolded = model.carried.length > CARRIED_FOLD_AT && carriedOpenOn !== todayIsoNow && !readCarriedOpen(todayIsoNow);
  const openCarried = () => {
    const day = model.today.toString();
    setCarriedOpenOn(day);
    try {
      localStorage.setItem(CARRIED_OPEN_KEY, day);
    } catch {
      // storage unavailable: it unfolds for this visit only
    }
  };

  // ---- time blocks (SCREENS.md §2.6): local for now, on the calendar with P7b.
  const blocks = useBlockRepo();
  const blockNudge = useBlockNudgePending();
  const blocking = useBlocking();
  const projectNames = useProjectNames();
  const { data: users } = useQuery<{ id: string; personal_space_id: string | null }>(USER_SQL);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [view, setView] = useState<TodayView>("list");
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
  const dayBounds = useMemo(() => {
    const start = model.today.toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from("00:00") }).toInstant().toString();
    const end = tomorrow.toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from("00:00") }).toInstant().toString();
    return [start, end] as [string, string];
  }, [model.today, tomorrow, zone]);
  const months = useMemo(() => monthsBack(model.today, 1), [model.today]);
  // What was finished today: the closed day's summary, Show completed, and the all-done state all read it. The
  // logbook subscription is the one use-today already holds for block states, so this costs no extra sync.
  const { data: doneRows } = useQuery<TaskRowType>(DONE_BETWEEN_SQL, dayBounds, { streams: [{ name: "logbook", parameters: { months }, ttl: 60 * 60 }] });
  const doneToday = useMemo(() => (doneRows ?? []).map(toTask), [doneRows]);
  // J/K walk the rows in the order they are drawn, Done last when it shows.
  const sel = useListSelection([model.carried.map((t) => t.id), todayList.map((t) => t.id), eveningList.map((t) => t.id), showCompleted ? doneToday.map((t) => t.id) : []]);
  // Everything planned for today is done (SCREENS.md §2.7 "All done"): at least one thing finished and nothing left on
  // today or this evening. Nothing planned and nothing finished is still the empty day below.
  const bodyState = dayState({ closed: Boolean(closedAt), carried: model.carried.length, today: model.todayTasks.length, evening: model.eveningTasks.length, done: doneToday.length });
  const allDone = model.ready && bodyState === "all-done";
  const emptyDay = model.ready && bodyState === "empty";
  const [pulling, setPulling] = useState(false);
  const wantsSuggestions = emptyDay || (allDone && pulling);
  const { data: openRows } = useQuery<TaskRowType>(wantsSuggestions ? OPEN_TASKS_SQL : NOTHING_SQL);
  const suggestions = useMemo(() => (wantsSuggestions ? pullInSuggestions((openRows ?? []).map(toTask), model.today) : []), [wantsSuggestions, openRows, model.today]);
  // Over (PRODUCT_SPEC.md §9.4): the ribbon names one move, the largest task with no deadline that fits tomorrow.
  const hero = model.capacity && model.capacity.state !== "no_work_day" ? heroState(model.capacity) : null;
  const overMin = hero?.over ? hero.min : 0;
  const { spareMin: tomorrowSpare } = useTomorrowSpare(tomorrow, model.settings, overMin > 0);
  const suggested = overMin > 0 ? easiestMove(model.todayTasks, overMin, tomorrowSpare, model.settings?.defaultEstimateMin ?? 30) : null;
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

  const hasDay = Boolean(model.capacity && model.capacity.state !== "no_work_day");
  const showDay = hasDay && view === "day";
  // The phone's Day view is a timeline, not a task list: its free gaps are what a tap schedules into, so the FAB steps aside.
  useHideQuickAddFab(showDay);
  // An ask is recorded once it is on screen: a folded pile shows none, and neither does Plan my day's preview, which
  // takes the lists' place.
  useRecordAsks(model.freshAsks, model.markAsked, model.ready && !carriedFolded && !(planning.mode && !closedAt));

  if (!model.ready) return <Loading />;
  const finish = model.capacity?.projectedFinish ?? null;
  // The phone's ritual row turns to the shutdown once the plan is projected to be done, or the day is two hours from its end.
  const shutdownTime = shutdownReady || (finish !== null && nowMinute >= finish.hour * 60 + finish.minute);
  const manual = sort === "manual";
  const carriedIds = model.carried.map((t) => t.id);
  const clearSlate = () => setSlateOpen(true);
  // The row's menu on a phone: Convert to project (PRODUCT_SPEC.md §6), beside the moves it already has.
  const convertItem = (id: string) => (
    <MenuOnly>
      <RowAction label="Convert to project" onClick={() => void breakDown(id)} />
    </MenuOnly>
  );
  const pullIn = (
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
  );
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
    <main data-print="today" className="flex w-full flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
      {/* Below the wide band the Day view replaces only the lists: the header, the hero and the ritual row (with the List/Day control) stay. */}
      <div className={cx("flex min-w-0 flex-col gap-6 px-5 py-6 sm:px-6 md:max-w-210 md:px-10 md:py-7 lg:min-h-0 lg:flex-1 lg:overflow-y-auto print:overflow-visible", showDay ? "pb-0 lg:pb-7" : "flex-1")}>
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
          compactActions={
            // Today's ⋯ on every band (SCREENS.md §2.1); its contents are a lazy island.
            <MenuButton label="Today options">
              {(close) => (
                <TodayMenu
                  close={close}
                  sort={sort}
                  onSort={(v) => savePref({ todaySort: v })}
                  showCompleted={showCompleted}
                  onShowCompleted={(v) => savePref({ showCompleted: v })}
                  onClearSlate={clearSlate}
                  onTrim={() => setTrimOpen(true)}
                  text={{ day: model.today, carried: model.carried, today: todayList, evening: eveningList, blockStart: (id) => model.blockByTask.get(id)?.start ?? null, defaultEstimateMin: defaultEstimate }}
                  onNotice={setNotice}
                />
              )}
            </MenuButton>
          }
        />

        <ExpiredDigest />
        {blockNudge && <BlockNudge />}
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
              <Ribbon
                c={model.capacity}
                nowMin={nowMinute}
                connected={model.calendarConnected}
                plannedCount={model.todayTasks.length + model.eveningTasks.length}
                onTrim={() => setTrimOpen(true)}
                suggestion={suggested?.task.title ?? null}
              />
            </>
          )
        )}

        {/* The ritual row (DESIGN_SYSTEM.md §5): the ritual of the hour and the List | Day control on one line, Plan my day
            and the review beneath on the phone; only the control from the narrow band up, until the wide band shows both panes. */}
        <div className="contents print:hidden">
        <RitualRow
          closed={Boolean(closedAt)}
          hasDay={hasDay}
          shutdownTime={shutdownTime}
          finish={finish}
          dayOver={dayOver}
          plannedAt={plannedAt}
          plan={{ label: PLAN_LABEL[nextPlan], open: planning.mode !== null, onOpen: () => planning.open(nextPlan) }}
          onReview={review && review.carried > 0 ? review.open : null}
          view={view}
          onView={setView}
        />
        </div>

        {planning.mode && !closedAt && (
          // Beside the timeline from the wide band, above it below that, and a sheet over the Day view on a phone.
          <LazyPlanIsland mode={planning.mode} model={model} now={now} layout="dock" onDrawing={planning.setDrawing} onClose={planning.close} />
        )}

        <div className={cx("flex-col gap-6", planning.mode && !closedAt ? "hidden" : showDay ? "hidden lg:flex" : "flex")}>
          {model.carried.length > 0 &&
            (carriedFolded ? (
              // More than eight carried: one summary line until it is opened (SCREENS.md §2.3, PRODUCT_SPEC.md §8.2 rule 10).
              <section className="flex flex-col gap-2">
                <button type="button" aria-expanded={false} onClick={openCarried} className={cx(EYEBROW, "-mx-2 flex min-h-11 items-center gap-2 rounded-sm px-2 text-left hover:bg-hover sm:min-h-7")}>
                  Carried over
                  <span className="font-medium normal-case tracking-normal num">
                    <b className="font-semibold text-ink-2">{model.carried.length}</b>
                    <span className="text-ink-3"> — </span>
                    <span className="text-ink-2 underline decoration-line-strong underline-offset-2">Expand</span>
                  </span>
                </button>
              </section>
            ) : (
              <section className="flex flex-col gap-2">
                <SectionLabel
                  className="px-0.5"
                  count={model.carried.length}
                  action={
                    <SectionAction onClick={clearSlate} title="Archive what is on the slate — nothing is deleted" className="print:hidden">
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
                      onBreakDown={t.ask ? undefined : () => void breakDown(t.id)}
                      // The three-carry ask takes the place of the four quick actions, in place (SCREENS.md §2.3).
                      actions={
                        !t.ask && (
                          <>
                            <MoveActions
                              onToday={() => void time("reschedule", () => model.repo.reschedule(t.id, model.today))}
                              onTomorrow={() => void time("reschedule", () => model.repo.reschedule(t.id, tomorrow))}
                              onSomeday={() => void time("someday", () => model.repo.setState(t.id, "someday"))}
                              onDrop={() => void time("drop", () => model.repo.setState(t.id, "dropped"))}
                            />
                            {convertItem(t.id)}
                          </>
                        )
                      }
                      footer={
                        t.ask && (
                          <CarryAsk
                            count={t.carryCount}
                            onKeep={() => void time("keep", () => model.repo.reschedule(t.id, model.today))}
                            onSomeday={() => void time("someday", () => model.repo.setState(t.id, "someday"))}
                            onBreakDown={() => void breakDown(t.id)}
                            onDrop={() => void time("drop", () => model.repo.setState(t.id, "dropped"))}
                          />
                        )
                      }
                    />
                  ))}
                  {model.carried.length >= 3 && (
                    // The whole pile at once, each one statement and one undo (SCREENS.md §2.3).
                    <li className="flex flex-wrap items-center gap-x-1 border-t border-line px-2 py-1 print:hidden sm:px-3">
                      <SectionAction onClick={() => void time("reschedule", () => model.repo.updateMany(carriedIds, { doDate: tomorrow }, "Moved {title} to tomorrow"))} className="mr-0">
                        Move all to tomorrow
                      </SectionAction>
                      <SectionAction onClick={() => void time("someday", () => model.repo.setStateMany(carriedIds, "someday"))} className="mr-0">
                        All to Someday
                      </SectionAction>
                    </li>
                  )}
                </TaskList>
              </section>
            ))}

          <section className="flex flex-col gap-2">
            <SectionLabel className="px-0.5" count={model.todayTasks.length} detail={sectionMinutes(model.todayTasks)}>
              Today
            </SectionLabel>
            <TaskList>
              {todayList.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  today={model.today}
                  draggable
                  // A sorted list is a view, not the hand order: reordering waits for Manual (it never rewrites day_sort_key).
                  onDropTask={manual ? (src, edge) => dropInToday(src, t.id, edge) : undefined}
                  timeChip={model.blockByTask.has(t.id) && <BlockChip block={model.blockByTask.get(t.id)!} />}
                  meta={meta(t)}
                  onOpen={() => detail.open(t.id)}
                  selected={sel.selectedId === t.id}
                  onSelect={() => sel.select(t.id)}
                  onDone={() => void time("complete", () => model.repo.complete(t.id))}
                  onBreakDown={() => void breakDown(t.id)}
                  actions={
                    <>
                      {manual && <RowAction label="Move up" text={null} icon="arrow-up" onClick={() => move(t, -1)} />}
                      {manual && <RowAction label="Move down" text={null} icon="arrow-down" onClick={() => move(t, 1)} />}
                      {/* The whole word, in the row and in the phone's menu: what is seen is what is named (WCAG 2.5.3). */}
                      <RowAction label="Tomorrow" icon="arrow-right" title="Tomorrow (Shift+T)" onClick={() => void time("reschedule", () => model.repo.reschedule(t.id, tomorrow))} />
                      {hasDay && !model.blockByTask.has(t.id) && (
                        <RowAction label={`Block ${t.title}`} text="Block" glyph={BLOCK_GLYPH} title="Pick a time on the timeline" onClick={() => startPlacing(t.id)} />
                      )}
                      {convertItem(t.id)}
                    </>
                  }
                />
              ))}
              {model.todayTasks.length === 0 && !emptyDay && !allDone && <li className="px-4 py-3 text-body-lg text-ink-3">Nothing planned yet.</li>}
              {allDone && (
                // All done (SCREENS.md §2.7): the facts and the two ways on, no celebration graphic.
                <li className="flex flex-col items-start gap-4 px-4 py-5 sm:px-5">
                  <p className="font-display text-pane font-medium text-pretty text-ink">
                    That&rsquo;s everything you planned.
                    {model.capacity && model.capacity.state !== "no_work_day" && model.capacity.spareMin > 0 && <> {formatMinutes(model.capacity.spareMin)} left.</>}
                  </p>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row print:hidden">
                    <button type="button" aria-expanded={pulling} onClick={() => setPulling((v) => !v)} className={cx(buttonClass({ variant: "secondary" }), "w-full sm:w-auto")}>
                      Pull something in
                    </button>
                    <Link href="/shutdown" className={cx(buttonClass({ variant: "quiet" }), "w-full sm:w-auto")}>
                      Shutdown ›
                    </Link>
                  </div>
                  {pulling && (suggestions.length > 0 ? pullIn : <p className="text-body-sm text-ink-2">Nothing waiting to pull in.</p>)}
                </li>
              )}
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
                      {pullIn}
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
                {eveningList.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    today={model.today}
                    draggable
                    onDropTask={manual ? (src, edge) => dropInEvening(src, t.id, edge) : undefined}
                    timeChip={model.blockByTask.has(t.id) && <BlockChip block={model.blockByTask.get(t.id)!} />}
                    meta={meta(t)}
                    onOpen={() => detail.open(t.id)}
                    selected={sel.selectedId === t.id}
                    onSelect={() => sel.select(t.id)}
                    onDone={() => void time("complete", () => model.repo.complete(t.id))}
                    onBreakDown={() => void breakDown(t.id)}
                    actions={convertItem(t.id)}
                  />
                ))}
              </TaskList>
            </section>
          )}

          {showCompleted && doneToday.length > 0 && (
            // Show completed (SCREENS.md §2.4): today's finished tasks under a Done divider at the bottom; Reopen (or U) brings one back.
            <section className="flex flex-col gap-2" aria-label="Done today">
              <SectionLabel className="px-0.5" count={doneToday.length}>
                Done
              </SectionLabel>
              <TaskList>
                {doneToday.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    today={model.today}
                    meta={meta(t)}
                    onOpen={() => detail.open(t.id)}
                    selected={sel.selectedId === t.id}
                    onSelect={() => sel.select(t.id)}
                    actions={<RowAction label="Reopen" primary title="Reopen (U)" onClick={() => void model.repo.reopen(t.id)} />}
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
            // No outline-none: in Tailwind v4 it also cancels the focus-visible outline, and the ring vanished (the global ring draws it, inset).
            "w-full flex-col px-5 pb-6 focus-visible:-outline-offset-2 sm:px-6 md:px-10 md:pb-7",
            "lg:ml-auto lg:h-full lg:w-86 lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-line lg:bg-surface lg:bg-daylight lg:px-5 lg:py-7 print:hidden!",
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
      {trimOpen && (
        <TrimToday
          tasks={model.todayTasks}
          overMin={overMin}
          defaultEstimateMin={defaultEstimate}
          onTomorrow={(id) => void time("reschedule", () => model.repo.reschedule(id, tomorrow))}
          onSomeday={(id) => void time("someday", () => model.repo.setState(id, "someday"))}
          onDrop={(id) => void time("drop", () => model.repo.setState(id, "dropped"))}
          onClose={() => setTrimOpen(false)}
        />
      )}
      {slateOpen && <ClearSlate today={model.today.toString()} onClose={() => setSlateOpen(false)} />}
      {notice && <Toast>{notice}</Toast>}
    </main>
  );
}
