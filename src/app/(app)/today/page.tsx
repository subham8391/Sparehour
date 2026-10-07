"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { coveredMinutes, estimateMismatch } from "@/core/blocking/coverage";
import { keyBetween } from "@/core/ordering";
import { Temporal, formatMinutes, formatTime, instant, timeFromMinutes, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { sortToday, type TodaySort } from "@/core/today/sort";
import type { Task } from "@/core/types";
import { normaliseTimestamp, toTask } from "@/data/mappers";
import { DAY_PLAN_SQL, DONE_BETWEEN_SQL, monthsBack } from "@/data/queries/shell";
import { SettingsRepo, type SettingsPatch } from "@/data/repositories/user-settings-repo";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useBlockNudgePending } from "@/features/notifications/block-nudge-store";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useCarryReview } from "@/features/rituals/carry-review-host";
import { easiestMove, plannedLabel } from "@/features/rituals/easiest-move";
import { useTomorrowSpare } from "@/features/rituals/use-tomorrow-spare";
import { PLAN_LABEL, planMode } from "@/features/planning/drawing";
import { LazyPlanIsland, usePlanPreview } from "@/features/planning/use-plan-preview";
import { Ribbon, heroState, preloadRibbonOverlay } from "@/features/today/ribbon";
import { useTaskDrag } from "@/features/today/task-drag";
import { useQuickAdd } from "@/features/quickadd/quick-add-provider";
import { dayState } from "@/features/today/day-state";
import { registerTodayHandler, type TodayRequest } from "@/features/today/today-request";
import { RitualLink, RitualRow, type TodayView } from "@/features/today/ritual-row";
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
import { ListLine } from "@/ui/list-card";
import { scrollMotion } from "@/ui/reduced-motion";
import { SectionAction, SectionLabel } from "@/ui/section-label";
import { Toast } from "@/ui/toast";
import { PaneBoundary } from "@/ui/pane-boundary";
import { BUILD_ID } from "@/data/build-id";
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
const preloadTodayIslands = () => Promise.all([loadTodayMenu(), loadTrimToday(), loadClearSlate(), preloadRibbonOverlay()]);
// "Your day" with its timeline (SCREENS.md §2.6): drawn as soon as the day is known, so it is fetched as the page
// mounts, alongside the local database opening, rather than on idle.
const loadDayPane = () => import("@/features/today/day-pane");
const DayPane = dynamic(() => loadDayPane().then((m) => m.DayPane), { ssr: false });
// The closed day's summary, All done and the empty day (one of them at most, and only on some days), and a long
// carried pile's folded line and its whole-pile moves.
const loadDayStates = () => import("@/features/today/day-states");
const CarriedFolded = dynamic(() => loadDayStates().then((m) => m.CarriedFolded), { ssr: false });
const CarriedPile = dynamic(() => loadDayStates().then((m) => m.CarriedPile), { ssr: false });
const ClosedDay = dynamic(() => loadDayStates().then((m) => m.ClosedDay), { ssr: false });
const AllDone = dynamic(() => loadDayStates().then((m) => m.AllDone), { ssr: false });
const EmptyDay = dynamic(() => loadDayStates().then((m) => m.EmptyDay), { ssr: false });
// This Evening with its budget line and phone disclosure, and the place to drop a dragged row on an empty section.
const loadEveningSection = () => import("@/features/today/evening-section");
const EveningSection = dynamic(() => loadEveningSection().then((m) => m.EveningSection), { ssr: false });
const SectionDrop = dynamic(() => loadEveningSection().then((m) => m.SectionDrop), { ssr: false });
const BlockDrop = dynamic(() => loadEveningSection().then((m) => m.BlockDrop), { ssr: false });
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
/** The eyebrow's second word: morning until noon, evening from the hour the person set (DESIGN_SYSTEM.md §5). */
function partOfDay(minute: number, eveningAt: number): "Morning" | "Afternoon" | "Evening" {
  if (minute < 12 * 60) return "Morning";
  return minute < eveningAt ? "Afternoon" : "Evening";
}

/**
 * The chip a blocked task carries in the list (SCREENS.md §2.6 "a small block indicator"); it stands in for the
 * do-time chip. Its first block's start, "+1" for each more (PRODUCT_SPEC.md §10.2: several are allowed), and in
 * its title every range and, when they and the estimate disagree, by how much: a hint, never an error.
 */
function BlockChip({ blocks, estimateMin }: { blocks: readonly TimelineBlock[]; estimateMin: number | null }) {
  const at = (m: number) => formatTime(timeFromMinutes(m));
  const off = estimateMismatch(coveredMinutes(blocks), estimateMin);
  return (
    <Chip tone="block" size="auto" title={`Blocked ${blocks.map((b) => `${at(b.start)}–${at(b.end)}`).join(", ")}${off ? ` · ${formatMinutes(off.min)} ${off.kind === "short" ? "short of" : "over"} the estimate` : ""}`}>
      {at(blocks[0].start)}
      {blocks.length > 1 && <span className="font-normal text-ink-2">+{blocks.length - 1}</span>}
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
  useEffect(() => void Promise.all([loadDayPane(), loadDayStates(), loadEveningSection()]).catch(() => undefined), []);
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

  // ---- time blocks (SCREENS.md §2.6): placed, moved and copied through the shared placing hook.
  const blockNudge = useBlockNudgePending();
  const projectNames = useProjectNames();
  const [view, setView] = useState<TodayView>("list");
  // A meeting clicked on the ribbon (SCREENS.md §2.2): the Day view on a phone, the timeline scrolled to it, marked for a moment.
  const [shownMeeting, setShownMeeting] = useState<number | null>(null);
  useEffect(() => {
    if (shownMeeting === null) return;
    document.querySelector(`[data-meeting="${shownMeeting}"]`)?.scrollIntoView?.({ block: "center", behavior: scrollMotion() });
    const t = setTimeout(() => setShownMeeting(null), 2400);
    return () => clearTimeout(t);
  }, [shownMeeting]);
  const quickAdd = useQuickAdd();
  // This Evening collapsed on a phone (SCREENS.md §2.8): its island says so, and J/K step over its rows.
  const [eveningShut, setEveningShut] = useState(false);
  // A row being dragged: an empty section shows where it can land (SCREENS.md §2.5). A block dragged off the
  // timeline onto the list is unblocked (SCREENS.md §2.6).
  const dragId = useTaskDrag();
  const blockDrag = useTaskDrag("block");
  const windows = model.capacity?.windows ?? [];
  const dayStart = windows[0]?.start ?? 9 * 60;
  const dayEnd = windows[windows.length - 1]?.end ?? 17 * 60;
  const defaultEstimate = model.settings?.defaultEstimateMin ?? 30;
  const nowMinute = (() => {
    const z = now.toZonedDateTimeISO(zone);
    return z.hour * 60 + z.minute;
  })();
  const findTask = (id: string): Task | undefined => [...model.carried, ...model.todayTasks, ...model.eveningTasks].find((t) => t.id === id);
  // The selected block, and tap-to-schedule: "Block…" on a row, then a tap on the timeline (Escape lets go). The
  // placing itself — B, drops, moves, copies, blocks of your own — runs in the day pane's island (use-placing.ts).
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const placingTask = placingId ? findTask(placingId) : undefined;
  const startPlacing = (id: string) => {
    setPlacingId(id);
    setView("day");
  };
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
  // J/K walk the rows in the order they are drawn, Done last when it shows; a collapsed This Evening is stepped over.
  const sel = useListSelection([model.carried.map((t) => t.id), todayList.map((t) => t.id), eveningShut ? [] : eveningList.map((t) => t.id), showCompleted ? doneToday.map((t) => t.id) : []]);
  // A row chosen after a block takes the keys back: Enter, L and Backspace act on the row, not the block.
  const [rowSeen, setRowSeen] = useState(sel.selectedId);
  if (sel.selectedId !== rowSeen) {
    setRowSeen(sel.selectedId);
    if (sel.selectedId) setSelectedBlockId(null);
  }
  // Everything planned for today is done (SCREENS.md §2.7 "All done"): at least one thing finished and nothing left on
  // today or this evening. Nothing planned and nothing finished is still the empty day below.
  const bodyState = dayState({ closed: Boolean(closedAt), carried: model.carried.length, today: model.todayTasks.length, evening: model.eveningTasks.length, done: doneToday.length });
  const allDone = model.ready && bodyState === "all-done";
  const emptyDay = model.ready && bodyState === "empty";
  const [pulling, setPulling] = useState(false);
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
  // A row dropped on a section with no row to land beside (empty, or held still by a sort): it goes to the end.
  const dropAtEnd = (list: Task[], evening: boolean) => (id: string) => {
    if (!findTask(id)) return;
    void time("reorder", () => model.repo.placeInDay(id, model.today, keyBetween(list[list.length - 1]?.daySortKey ?? null, null), evening));
  };

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
  const canLand = (list: Task[]) => dragId !== null && !list.some((t) => t.id === dragId) && (list.length === 0 || !manual);
  const carriedIds = model.carried.map((t) => t.id);
  const clearSlate = () => setSlateOpen(true);
  // The row's menu on a phone: Convert to project (PRODUCT_SPEC.md §6), beside the moves it already has.
  const convertItem = (id: string) => (
    <MenuOnly>
      <RowAction label="Convert to project" onClick={() => void breakDown(id)} />
    </MenuOnly>
  );
  // The pull-in suggestions under All done and the empty day: what they offer, and the two things a row does.
  const pullInProps = {
    today: model.today,
    spareMin: model.capacity && model.capacity.state !== "no_work_day" ? model.capacity.spareMin : 0,
    onOpen: (id: string) => detail.open(id),
    onToday: (id: string) => void time("reschedule", () => model.repo.reschedule(id, model.today)),
  };
  const sectionTotal = (list: Task[]) => list.reduce((s, t) => s + (t.estimateMin ?? defaultEstimate), 0);
  const sectionMinutes = (list: Task[]) => formatMinutes(sectionTotal(list));
  // The project name in the row's quiet run, as on every other cross-project list (DESIGN_SYSTEM.md §5 "Task row").
  const meta = (t: Task) => t.projectId && projectNames.has(t.projectId) && <span>{projectNames.get(t.projectId)}</span>;
  const blockChip = (t: Task) => {
    const bs = model.blocksByTask.get(t.id);
    return bs ? <BlockChip blocks={bs} estimateMin={t.estimateMin} /> : undefined;
  };
  const eveningRows = (
    <TaskList>
      {eveningList.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          today={model.today}
          draggable
          onDropTask={manual ? (src, edge) => dropInEvening(src, t.id, edge) : undefined}
          timeChip={blockChip(t)}
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
  );
  const eveningDrop = canLand(model.eveningTasks);
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
                  text={{ day: model.today, carried: model.carried, today: todayList, evening: eveningList, blockStart: (id) => model.blocksByTask.get(id)?.[0]?.start ?? null, defaultEstimateMin: defaultEstimate }}
                  onNotice={setNotice}
                />
              )}
            </MenuButton>
          }
        />

        <ExpiredDigest />
        {blockNudge && <BlockNudge />}
        {closedAt ? (
          <ClosedDay done={doneToday} defaultEstimateMin={defaultEstimate} closedAt={closedAt} rating={plan?.day_rating ?? null} highlights={plan?.highlights ?? null} />
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
                finished={doneToday.length > 0}
                onTrim={() => setTrimOpen(true)}
                suggestion={suggested?.task.title ?? null}
                interactions={{
                  bufferPct: model.settings?.bufferPct ?? 15,
                  meetings: model.meetings,
                  blocks: model.blocks,
                  // Free time clicked: "Add something" for today (SCREENS.md §2.2).
                  onAdd: () => quickAdd.open("today "),
                  onMeeting: (m) => {
                    setView("day");
                    // From the wide band an open detail stands in the day pane's place.
                    if (detail.selectedId) detail.close();
                    setShownMeeting(m.start);
                  },
                }}
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

        {/* Each pane fails in place (SCREENS.md §21): a list that throws leaves the day pane working, and the other way round. */}
        <PaneBoundary name="Today’s list" build={BUILD_ID}>
        <div className={cx("flex-col gap-6", planning.mode && !closedAt ? "hidden" : showDay ? "hidden lg:flex" : "flex")}>
          {/* A block dragged off the timeline onto the list is unblocked; its task stays where it is (SCREENS.md §2.6). */}
          {blockDrag && <BlockDrop />}
          {model.carried.length > 0 &&
            (carriedFolded ? (
              // More than eight carried: one summary line until it is opened (SCREENS.md §2.3, PRODUCT_SPEC.md §8.2 rule 10).
              <CarriedFolded count={model.carried.length} onOpen={openCarried} />
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
                      timeChip={blockChip(t)}
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
                    <CarriedPile
                      onTomorrow={() => void time("reschedule", () => model.repo.updateMany(carriedIds, { doDate: tomorrow }, "Moved {title} to tomorrow"))}
                      onSomeday={() => void time("someday", () => model.repo.setStateMany(carriedIds, "someday"))}
                    />
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
                  timeChip={blockChip(t)}
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
                      {/* Still there once blocked: a task may take a second block (PRODUCT_SPEC.md §10.2). */}
                      {hasDay && (
                        <RowAction label={`Block ${t.title}`} text="Block" glyph={BLOCK_GLYPH} title="Pick a time on the timeline" onClick={() => startPlacing(t.id)} />
                      )}
                      {convertItem(t.id)}
                    </>
                  }
                />
              ))}
              {model.todayTasks.length === 0 && !emptyDay && !allDone && <ListLine cellClassName="px-4 py-3 text-body-lg text-ink-3">Nothing planned yet.</ListLine>}
              {/* All done (SCREENS.md §2.7) and the returning person's empty day (ONBOARDING.md §4). */}
              {allDone && <AllDone {...pullInProps} pulling={pulling} onPull={() => setPulling((v) => !v)} />}
              {emptyDay && <EmptyDay {...pullInProps} />}
            </TaskList>
            {canLand(model.todayTasks) && <SectionDrop label="Drop here to do it today" onDrop={dropAtEnd(model.todayTasks, false)} />}
          </section>

          {model.settings && (model.eveningTasks.length > 0 || eveningDrop) && (
            // This Evening (SCREENS.md §2.5): its own readout and quieter overload line; collapsed on a phone (§2.8).
            <EveningSection
              count={model.eveningTasks.length}
              plannedMin={sectionTotal(model.eveningTasks)}
              windows={model.capacity?.windows ?? []}
              eveningStartsAt={model.settings.eveningStartsAt}
              eveningEndsAt={model.settings.eveningEndsAt}
              rows={eveningRows}
              onDrop={eveningDrop ? dropAtEnd(model.eveningTasks, true) : null}
              onShutChange={setEveningShut}
            />
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
        </PaneBoundary>
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
          <PaneBoundary name="Your day" build={BUILD_ID}>
          <DayPane
            start={dayStart}
            end={dayEnd}
            bufferPct={model.settings?.bufferPct}
            hint={model.blocks.length === 0 && !placingTask && !planning.mode}
            placing={{
              day: model.today,
              zone,
              blocks: model.blocks,
              free: model.capacity.free,
              dayStart,
              dayEnd,
              nowMinute,
              defaultEstimateMin: defaultEstimate,
              findTask,
              onPlaced: () => setView("day"),
              state: { selectedBlockId, setSelectedBlockId, placing: placingId, setPlacing: setPlacingId },
            }}
            onOpenTask={detail.open}
            timeline={{
              // While previewing, the gaps are what the proposal leaves; the "done by" marker belongs to the day as it is, so it steps aside.
              c: drawing ? { ...model.capacity, free: [...drawing.free], projectedFinish: null } : model.capacity,
              now,
              zone,
              blocks: drawing ? model.blocks.filter((b) => !replacedIds.has(b.id)) : model.blocks,
              proposed: drawing?.ghosts,
              meetings: model.meetings,
              shownMeeting,
              defaultEstimateMin: defaultEstimate,
              paneScrolls: true,
            }}
          />
          </PaneBoundary>
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
