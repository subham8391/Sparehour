"use client";
// The morning plan (SCREENS.md §14): three steps, one spare number, and an
// always-available Skip. Presentational; the page feeds it the day and does
// the writes as choices are made.
//
// Step 2 is a keyboard picker as much as a list (SCREENS.md §14 "Interactions"): J/K walk the rows, Space ticks,
// T / Shift+T / S / Backspace act on the highlighted row (the app's own keys), E edits its estimate in place, N adds
// a task to today, → or Enter goes on. On a phone the capacity summary is pinned at the top with the Easiest move
// under it, and the three groups fold; from `sm` the readout stays at the end of the step as built (DECISIONS.md
// "Morning plan readout"). Step 3 blocks the picked tasks on the day's timeline: drag one on, tap it (or its
// Block) and then a time, or B for the next free gap — the same timeline, writes and keys as Today's.
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import type { PlanDrawing } from "@/features/planning/drawing";
import type { TimelineBlock, TimelineMeeting } from "@/features/today/hooks/use-today";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Capacity } from "@/core/capacity";
import { formatMinutes, formatTime, timeFromMinutes, type Instant, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { TaskDragData } from "@/features/blocking/drag";
import { useSelectionOptional } from "@/features/selection/selection-provider";
import { useHideQuickAddFab } from "@/features/shell/fab-visibility";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Chip, DeadlineChip, chipClass } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { ListCard } from "@/ui/list-card";
import { MENU_ITEM, MenuButton, type MenuHandle } from "@/ui/popover";
import { SectionLabel } from "@/ui/section-label";
import { dayChip } from "@/features/tasks/day-chip";
import { CarryAsk } from "@/features/tasks/carry-ask";
import { DayChipTag } from "@/features/tasks/day-chip-tag";
import { BLOCK_GLYPH, MoveActions, RowActionsLayoutProvider } from "@/features/tasks/task-actions";
import { PlacingBar, Timeline, type TimelineProps } from "@/features/today/timeline";
import { PLAN_STEPS, easiestMove, readout, type Candidates, type PlanStep } from "./morning-plan";
import { PlanHero } from "./plan-hero";
import { RitualFooter, RitualFrame } from "./ritual-frame";

export interface MorningPlanFlowProps {
  /** Today's titled meetings for the timeline; optional, the drawing says Busy without them. */
  meetings?: readonly TimelineMeeting[];
  /** Time already blocked out today, so step 3 draws the day Today draws. */
  blocks?: readonly TimelineBlock[];
  capacity: Capacity | null;
  /** The picker's groups, frozen when the flow opened so rows do not jump as choices are made. */
  groups: Candidates;
  /** Tasks currently on today (picked), including ones ticked during this flow. */
  onToday: readonly Task[];
  fitsMin: number;
  tomorrowSpareMin: number | null;
  /** When This Evening's own time starts (the end of the working day), for step 2's note; null leaves the time unnamed. */
  eveningStartMin?: number | null;
  defaultEstimateMin: number;
  /** The carried tasks that show the three-carry ask now: Today's two a day (PRODUCT_SPEC.md §8.3.4). */
  asks: ReadonlySet<string>;
  /** "Break it down": converts the task into a project and opens it. */
  onBreakDown?: (id: string) => void;
  /** Step 2, where the asks are, is on screen: they can be recorded as shown. */
  onAsksShown?: () => void;
  today: LocalDate;
  now: Instant;
  zone: string;
  onPick: (task: Task, picked: boolean) => void;
  onCarry: (id: string, to: "today" | "tomorrow" | "someday" | "drop") => void;
  onMoveToTomorrow: (id: string) => void;
  /** A new estimate from the row's chip (or E): the readout follows at once. */
  onEstimate?: (id: string, minutes: number) => void;
  /** N: a new task for today. */
  onAddTask?: () => void;
  onDone: () => void;
  onSkip: () => void;
  /** Plan my day inside the last step (SCREENS.md §14 step 3): the button, the open preview, and what it draws on the timeline. */
  planMyDay?: PlanMyDayStep;
  /** Step 3's time blocking: the timeline's handlers and tap-to-schedule, from the shared placing hook. */
  blocking?: BlockingStep;
}

export interface PlanMyDayStep {
  open: boolean;
  onOpen: () => void;
  /** The preview island, shown above the timeline while open. */
  preview: ReactNode;
  drawing: PlanDrawing | null;
}

export interface BlockingStep {
  /** What the timeline does when a person acts on it (features/today/day-pane.tsx `placerTimeline`). */
  timeline: Omit<TimelineProps, "c" | "now" | "zone" | "blocks" | "meetings" | "proposed">;
  /** Tap-to-schedule: the task waiting for a tap on the timeline. */
  placing: { title: string; onCancel: () => void } | null;
  /** A task (or its Block) tapped: the next tap on the timeline places it. */
  onPlace: (taskId: string) => void;
  /**
   * Why blocking is paused (calendar access revoked, or the write calendar gone; PRODUCT_SPEC.md §10.3 rule 5), said
   * over the timeline where a tap would have placed a block. Null while blocking works.
   */
  paused?: string | null;
}

const TITLES: Record<PlanStep, string> = { frame: "Here’s your day", pick: "Pick today’s tasks", block: "Block time" };
const LABELS = PLAN_STEPS.map((s) => TITLES[s]);
/** The estimate presets, as the detail offers them. */
const ESTIMATES = [15, 25, 30, 45, 60, 90, 120];

/** Step 2's note (SCREENS.md §14): evening tasks stay out of the readout, and the note says what they add up to after work. */
export function eveningNote(onToday: readonly Task[], defaultEstimateMin: number, startMin: number | null): string {
  const planned = onToday.filter((t) => t.evening).reduce((sum, t) => sum + (t.estimateMin ?? defaultEstimateMin), 0);
  if (planned === 0 || startMin === null) return "Evening tasks aren’t counted here — they get their own time after work.";
  return `Evening tasks aren’t counted here — they get their own ${formatMinutes(planned)} after ${formatTime(timeFromMinutes(startMin))}.`;
}

/** A key the flow takes for itself only when no control has the focus (a field, a button, a menu keeps its own). */
const ownsKey = (target: EventTarget | null) => !(target as HTMLElement | null)?.closest?.("input, textarea, select, button, a, [contenteditable='true'], [role='menu'], [role='dialog']");

/**
 * The flow's rows in the app's one keyboard selection, so J/K and the row keys (T, Shift+T, S, Backspace, B) reach
 * them; without the provider (a test, a preview) the flow keeps its own.
 */
function useRowSelection(ids: readonly string[]) {
  const api = useSelectionOptional();
  const [own, setOwn] = useState<string | null>(null);
  const register = api?.register;
  const key = ids.join(" ");
  useEffect(() => {
    register?.(key ? key.split(" ") : []);
  }, [key, register]);
  useEffect(() => () => register?.([]), [register]);
  return api ? { selectedId: api.selectedId, select: api.select } : { selectedId: own, select: setOwn };
}

export function MorningPlanFlow(p: MorningPlanFlowProps) {
  const [step, setStep] = useState<PlanStep>("frame");
  const [showAll, setShowAll] = useState(false);
  const [keptAnyway, setKeptAnyway] = useState<string | null>(null);
  const [estimating, setEstimating] = useState<{ id: string; at: number } | null>(null);
  const index = PLAN_STEPS.indexOf(step);
  const picked = new Set(p.onToday.map((t) => t.id));
  const r = readout(p.onToday, p.fitsMin, p.defaultEstimateMin);
  const move = easiestMove(p.onToday, r.overMin, p.tomorrowSpareMin, p.defaultEstimateMin);
  const coachMove = move && keptAnyway !== move.task.id ? move : null;
  const c = p.capacity;
  // A plan asked for from the palette or Cmd+Shift+P opens on the last step, wherever the flow is.
  const planOpen = Boolean(p.planMyDay?.open);
  const [sawPlanOpen, setSawPlanOpen] = useState(false);
  if (planOpen !== sawPlanOpen) {
    setSawPlanOpen(planOpen);
    if (planOpen) setStep("block");
  }

  const onAsksShown = p.onAsksShown;
  useEffect(() => {
    if (step === "pick") onAsksShown?.();
  }, [step, onAsksShown]);
  // The phone's timeline step is a place to tap times into: the FAB steps aside (SCREENS.md §14 Responsive).
  useHideQuickAddFab(step === "block");

  const projects = showAll ? p.groups.fromProjects : p.groups.fromProjects.slice(0, 6);
  const pickRows = [...p.groups.carried, ...p.groups.dueThisWeek, ...projects];
  const blockedIds = new Set((p.blocks ?? []).flatMap((b) => (b.taskId ? [b.taskId] : [])));
  const toBlock = p.onToday.filter((t) => !t.evening && !blockedIds.has(t.id));
  const sel = useRowSelection(step === "pick" ? pickRows.map((t) => t.id) : step === "block" ? toBlock.map((t) => t.id) : []);
  const next = () => index < PLAN_STEPS.length - 1 && setStep(PLAN_STEPS[index + 1]);

  // The step's own keys, ahead of the app's: Space ticks, E edits the estimate, N adds, → or Enter goes on.
  const keysRef = useRef<(e: KeyboardEvent) => boolean>(() => false);
  useEffect(() => {
    keysRef.current = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !ownsKey(e.target)) return false;
      if (step === "block") return false;
      if ((e.key === "ArrowRight" && !e.shiftKey) || e.key === "Enter") {
        next();
        return true;
      }
      if (step !== "pick") return false;
      const row = pickRows.find((t) => t.id === sel.selectedId);
      if (e.key === " " && row) p.onPick(row, !picked.has(row.id));
      else if ((e.key === "e" || e.key === "E") && !e.shiftKey && row && p.onEstimate) setEstimating({ id: row.id, at: Date.now() });
      else if ((e.key === "n" || e.key === "N") && !e.shiftKey && p.onAddTask) p.onAddTask();
      else return false;
      return true;
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || !keysRef.current(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const pickRow = (t: Task, extra: { actions?: ReactNode; footer?: ReactNode } = {}) => (
    <PickRow
      key={t.id}
      task={t}
      picked={picked.has(t.id)}
      today={p.today}
      onPick={p.onPick}
      defaultEstimateMin={p.defaultEstimateMin}
      selected={sel.selectedId === t.id}
      onSelect={() => sel.select(t.id)}
      onEstimate={p.onEstimate && ((m) => p.onEstimate?.(t.id, m))}
      estimateRequest={estimating?.id === t.id ? estimating.at : 0}
      {...extra}
    />
  );
  const over = r.overMin > 0;
  const coachCard = coachMove && (
    <div className="flex flex-col gap-2">
      <p className="text-body text-ink">
        <span className="font-medium">Easiest move</span> · {coachMove.task.title} · <span className="num">{formatMinutes(coachMove.task.estimateMin ?? p.defaultEstimateMin)}</span>
        {coachMove.task.estimateMin == null && "?"}
      </p>
      <p className="text-body-sm text-pretty text-ink-2">{coachMove.reason}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="primary" onClick={() => p.onMoveToTomorrow(coachMove.task.id)}>
          Move to tomorrow
        </Button>
        <Button variant="quiet" onClick={() => setKeptAnyway(coachMove.task.id)}>
          Keep it anyway
        </Button>
      </div>
    </div>
  );

  let body: ReactNode;
  switch (step) {
    case "frame":
      body = (
        <>
          <PlanHero c={c} now={p.now} zone={p.zone} carried={p.groups.carried.length} />
          <p className="text-body-lg text-pretty text-ink-2">Nothing to do here but read. The next step is the only decision of the morning.</p>
        </>
      );
      break;
    case "pick": {
      const summary = `${formatMinutes(r.fitsMin)} fits today · ${formatMinutes(r.pickedMin)} picked · ${r.count} ${r.count === 1 ? "task" : "tasks"}`;
      body = (
        <>
          {/* The phone pins the summary at the top of the step, the Easiest move under it when over (SCREENS.md §14 Responsive). */}
          <div
            aria-hidden="true"
            data-testid="plan-summary"
            className={cx("sticky top-0 z-10 -mx-1 rounded-lg border px-3 py-2 text-body-sm font-medium num max-sm:order-first sm:hidden", over ? "border-over-line bg-over-soft text-over" : "border-line bg-surface text-ink")}
          >
            {over && `${formatMinutes(r.overMin)} over · `}
            {summary}
          </div>
          <p className="text-body-lg text-pretty text-ink-2">Tick what you&rsquo;ll work on. Everything else waits without turning red.</p>
          <Group title="Carried over" count={p.groups.carried.length}>
            {p.groups.carried.map((t) =>
              pickRow(t, {
                // The ask takes the place of the four moves, as on Today.
                actions: !(p.asks.has(t.id) && !picked.has(t.id)) && (
                  <MoveActions onToday={() => p.onCarry(t.id, "today")} onTomorrow={() => p.onCarry(t.id, "tomorrow")} onSomeday={() => p.onCarry(t.id, "someday")} onDrop={() => p.onCarry(t.id, "drop")} />
                ),
                footer:
                  p.asks.has(t.id) && !picked.has(t.id) ? (
                    // The same panel and the same sentence as the Today list: one gentle ask in the product.
                    <CarryAsk
                      count={t.carryCount}
                      onKeep={() => p.onCarry(t.id, "today")}
                      onSomeday={() => p.onCarry(t.id, "someday")}
                      onBreakDown={p.onBreakDown && (() => p.onBreakDown?.(t.id))}
                      onDrop={() => p.onCarry(t.id, "drop")}
                    />
                  ) : null,
              }),
            )}
          </Group>
          <Group title="Due this week" count={p.groups.dueThisWeek.length}>
            {p.groups.dueThisWeek.map((t) => pickRow(t))}
          </Group>
          <Group title="From your projects" count={p.groups.fromProjects.length}>
            {projects.map((t) => pickRow(t))}
            {!showAll && p.groups.fromProjects.length > 6 && (
              <li className="border-t border-line px-4 py-1">
                <Button variant="link" className="-ml-2 text-ink-2" onClick={() => setShowAll(true)}>
                  More · {p.groups.fromProjects.length - 6}
                </Button>
              </li>
            )}
          </Group>
          {/* The one live readout, read out on every tick and estimate; the cards around it are what is seen. */}
          <p role="status" aria-live="polite" className="sr-only">
            {r.line}
            {r.coach && ` ${r.coach}`}
          </p>
          <div aria-hidden="true" className={cx("rounded-xl border p-4 max-sm:hidden", over ? "border-over-line bg-over-soft" : "border-line bg-surface", coachCard && "rounded-b-none")}>
            <p className="text-body font-medium text-ink num">{r.line}</p>
            {r.coach && <p className="mt-1.5 text-body text-pretty text-ink-2">{r.coach}</p>}
          </div>
          {coachCard && (
            // One card, two places: under the pinned summary on a phone, under the readout from `sm`, as built.
            <div className="rounded-xl border border-over-line bg-over-soft p-4 max-sm:-order-1 sm:-mt-4 sm:rounded-t-none sm:border-t-0 sm:pt-0">
              <div className="sm:border-t sm:border-over-line sm:pt-3">{coachCard}</div>
            </div>
          )}
          <p className="text-body-sm text-pretty text-ink-3">{eveningNote(p.onToday, p.defaultEstimateMin, p.eveningStartMin ?? null)}</p>
        </>
      );
      break;
    }
    case "block": {
      const plan = p.planMyDay;
      const drawing = plan?.open ? plan.drawing : null;
      const replaced = new Set(drawing?.replacedIds ?? []);
      const b = p.blocking;
      body = (
        <>
          <p className="text-body-lg text-pretty text-ink-2">
            {b ? "Drag a task onto your day, or tap it and then a time. B puts the selected one in the next free gap." : "Your day as it stands."}
            {plan && " Plan my day proposes blocks for today’s tasks around your meetings, and nothing changes until you approve."}
          </p>
          {c && c.state !== "no_work_day" ? (
            <>
              {plan && !plan.open && (
                <div>
                  <Button variant="secondary" onClick={plan.onOpen}>
                    Plan my day
                  </Button>
                </div>
              )}
              {plan?.open && plan.preview}
              {/* The spare figure follows every block placed (SCREENS.md §14 Behaviour 1). */}
              <p aria-live="polite" className={cx("text-body font-medium num", c.spareMin < 0 ? "text-over" : "text-ink")}>
                {c.spareMin < 0 ? `${formatMinutes(-c.spareMin)} over` : `${formatMinutes(c.spareMin)} spare`}
                <span className="font-normal text-ink-2"> · {toBlock.length === 0 ? "everything picked has a time" : `${toBlock.length} to block`}</span>
              </p>
              <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:items-start md:gap-6">
                {b && toBlock.length > 0 && (
                  <section aria-label="To block" className="flex flex-col gap-2">
                    <SectionLabel count={toBlock.length}>To block</SectionLabel>
                    <ListCard>
                      {toBlock.map((t) => (
                        <BlockRow
                          key={t.id}
                          task={t}
                          defaultEstimateMin={p.defaultEstimateMin}
                          selected={sel.selectedId === t.id}
                          onPlace={() => {
                            sel.select(t.id);
                            b.onPlace(t.id);
                          }}
                        />
                      ))}
                    </ListCard>
                  </section>
                )}
                <div className={cx("rounded-xl border border-line bg-surface bg-daylight px-3 py-4 sm:px-4", !(b && toBlock.length > 0) && "md:col-span-2")}>
                  {b?.paused && (
                    <p role="note" className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-body-sm text-pretty text-ink-2">
                      {b.paused}
                    </p>
                  )}
                  {b?.placing && !b.paused && <PlacingBar text={`Tap a time for “${b.placing.title}”`} onCancel={b.placing.onCancel} />}
                  <Timeline
                    c={drawing ? { ...c, free: [...drawing.free], projectedFinish: null } : c}
                    now={p.now}
                    zone={p.zone}
                    meetings={p.meetings}
                    blocks={drawing ? (p.blocks ?? []).filter((x) => !replaced.has(x.id)) : p.blocks}
                    proposed={drawing?.ghosts}
                    defaultEstimateMin={p.defaultEstimateMin}
                    {...b?.timeline}
                  />
                </div>
              </div>
            </>
          ) : (
            <p className="text-body-lg text-ink-3">No working hours today.</p>
          )}
        </>
      );
      break;
    }
  }

  return (
    <RitualFrame
      eyebrow={
        <>
          Morning plan · <span className="num">{index + 1}</span> of <span className="num">{PLAN_STEPS.length}</span>
        </>
      }
      title={TITLES[step]}
      steps={{ labels: LABELS, index, onStep: (i) => setStep(PLAN_STEPS[i]) }}
      onSkip={p.onSkip}
      footer={
        <RitualFooter
          onBack={() => index > 0 && setStep(PLAN_STEPS[index - 1])}
          canGoBack={index > 0}
          primary={step === "block" ? { label: "Done", onClick: p.onDone } : { label: step === "frame" ? "Next" : "Next · Block time", onClick: next }}
        />
      }
    >
      {body}
    </RitualFrame>
  );
}

/** A group of the picker: its label from `sm`, and on a phone a 44 px header that folds it, with its count. */
function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <SectionLabel count={count} className="max-sm:hidden">
        {title}
      </SectionLabel>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="-mx-2 flex min-h-11 items-center gap-2 rounded-sm px-2 text-label font-semibold tracking-wide text-ink-3 uppercase transition-colors dur-fast hover:bg-hover sm:hidden"
      >
        <Icon name="chevron-right" size={14} className={cx("shrink-0 motion-safe:transition-transform motion-safe:dur-fast", open && "rotate-90")} />
        {title}
        <b className="font-semibold tracking-normal text-ink-2 normal-case num">{count}</b>
      </button>
      <div id={id} className={cx(!open && "max-sm:hidden")}>
        {count === 0 ? <p className="text-body text-ink-3">Nothing here.</p> : <ListCard>{children}</ListCard>}
      </div>
    </section>
  );
}

/** The row's estimate as a chip that edits in place with the presets (SCREENS.md §14 "Estimates editable in place"); E opens it. */
function EstimateChip({ task, defaultEstimateMin, onEstimate, request }: { task: Task; defaultEstimateMin: number; onEstimate?: (minutes: number) => void; request: number }) {
  const label = (
    <>
      {formatMinutes(task.estimateMin ?? defaultEstimateMin)}
      {task.estimateMin == null && "?"}
    </>
  );
  const menu = useRef<MenuHandle>(null);
  useEffect(() => {
    if (request > 0) menu.current?.open();
  }, [request]);
  if (!onEstimate) {
    return (
      <Chip tone={task.estimateMin ? "neutral" : "guess"} size="auto">
        {label}
      </Chip>
    );
  }
  return (
    <MenuButton
      label={`Estimate for ${task.title}`}
      handle={menu}
      portal
      text={label}
      className={cx(
        chipClass({ tone: task.estimateMin ? "neutral" : "guess", size: "auto" }),
        "relative z-1 cursor-pointer hover:border-line-strong max-sm:h-8 hit-touch",
        // 32 px drawn, 44 px to the finger on a phone (DESIGN_SYSTEM.md §4a).
        "max-sm:before:absolute max-sm:before:inset-x-0 max-sm:before:-inset-y-1.5 max-sm:before:content-['']",
      )}
    >
      {(close) =>
        ESTIMATES.map((m) => (
          <button key={m} type="button" role="menuitem" aria-current={task.estimateMin === m || undefined} className={cx(MENU_ITEM, "num")} onClick={() => (close(), onEstimate(m))}>
            {formatMinutes(m)}
          </button>
        ))
      }
    </MenuButton>
  );
}

/**
 * A row of the picker, in the task row's clothes: the tick where the ring
 * would be, the title (the tick's label, so it toggles too), the chips in
 * the family's tones, and on carried rows the move actions — the hover zone
 * from `sm`, and on the phone the row's "More actions" menu, because there
 * the tick is the decision and everything else waits behind the `⋯`.
 * `footer` is the gentle ask. The highlighted row (J/K, a click) carries the
 * ink edge every selected row does.
 */
function PickRow({
  task,
  picked,
  today,
  onPick,
  defaultEstimateMin,
  selected,
  onSelect,
  onEstimate,
  estimateRequest,
  actions,
  footer,
}: {
  task: Task;
  picked: boolean;
  today: LocalDate;
  onPick: (task: Task, picked: boolean) => void;
  defaultEstimateMin: number;
  selected: boolean;
  onSelect: () => void;
  onEstimate?: (minutes: number) => void;
  estimateRequest: number;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  const id = useId();
  // The day chip says where a task waits ("Inbox", "Wed"); under the "Carried over" label it would only repeat the heading, and the count carries the rest.
  const chip = dayChip(task, today);
  const chips = (
    <>
      {!picked && chip && chip.tone !== "carried" && <DayChipTag chip={chip} />}
      {task.deadline && <DeadlineChip deadline={task.deadline} today={today} size="auto" />}
      {task.carryCount > 1 && <span className="text-ink-3">×{task.carryCount}</span>}
      <EstimateChip task={task} defaultEstimateMin={defaultEstimateMin} onEstimate={onEstimate} request={estimateRequest} />
    </>
  );
  return (
    <li className={cx("border-t border-line transition-colors dur-fast first:border-t-0 hover:bg-hover", selected && "shadow-[inset_2px_0_0_var(--ink)]")} aria-current={selected ? "true" : undefined} onClickCapture={onSelect}>
      <div
        className={cx(
          "flex min-h-14 items-center gap-x-3 py-2 sm:grid sm:min-h-11 sm:gap-x-0 sm:py-0 sm:pr-0",
          actions ? "sm:grid-cols-[44px_minmax(0,1fr)_auto_auto]" : "max-sm:pr-4 sm:grid-cols-[44px_minmax(0,1fr)_auto]",
        )}
      >
        <Checkbox id={id} checked={picked} onChange={(e) => onPick(task, e.target.checked)} aria-label={`Pick ${task.title}`} />
        {/* The body stacks title and chips on a phone; from `sm` it dissolves and they become grid cells. */}
        <div className="min-w-0 flex-1 sm:contents">
          <label htmlFor={id} className="block min-w-0 sm:flex sm:min-h-11 sm:items-center sm:pr-3">
            <span className="line-clamp-2 text-body-lg leading-snug text-ink [overflow-wrap:anywhere] sm:line-clamp-1 sm:leading-5">{task.title}</span>
          </label>
          <div className="mt-0.5 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-label text-ink-2 num max-sm:fade-end sm:contents">
            <span className={cx("flex shrink-0 items-center gap-1.5 sm:justify-end sm:pr-4 sm:text-body-sm", !actions && "sm:pr-4")}>{chips}</span>
          </div>
        </div>
        {actions && (
          <div className="hidden items-center justify-end gap-0.5 pr-2 sm:flex">
            <RowActionsLayoutProvider layout="inline">{actions}</RowActionsLayoutProvider>
          </div>
        )}
        {actions && (
          <div className="relative z-1 -my-2 -ml-1 shrink-0 sm:hidden">
            <MenuButton label="More actions">
              {(close) => (
                <RowActionsLayoutProvider layout="menu" close={close}>
                  {actions}
                </RowActionsLayoutProvider>
              )}
            </MenuButton>
          </div>
        )}
      </div>
      {footer}
    </li>
  );
}

/**
 * A picked task still without a time, in step 3: dragged onto the timeline it becomes a block; tapped (the title
 * or its Block), the next tap on the timeline places it — the phone's way, and the keyboard's with B.
 */
function BlockRow({ task, defaultEstimateMin, selected, onPlace }: { task: Task; defaultEstimateMin: number; selected: boolean; onPlace: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: (): TaskDragData => ({ type: "task", id: task.id, title: task.title, estimateMin: task.estimateMin }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
  }, [task.id, task.title, task.estimateMin]);
  return (
    <li
      ref={ref}
      aria-current={selected ? "true" : undefined}
      className={cx("flex min-h-14 cursor-grab items-center gap-2 border-t border-line pr-1.5 pl-4 first:border-t-0 hover:bg-hover sm:min-h-11", selected && "shadow-[inset_2px_0_0_var(--ink)]", dragging && "opacity-40")}
    >
      <button type="button" onClick={onPlace} className="min-w-0 flex-1 self-stretch truncate py-2 text-left text-body-lg text-ink sm:text-body">
        {task.title}
      </button>
      <Chip tone={task.estimateMin ? "neutral" : "guess"} size="auto">
        {formatMinutes(task.estimateMin ?? defaultEstimateMin)}
        {task.estimateMin == null && "?"}
      </Chip>
      <Button variant="quiet" onClick={onPlace} aria-label={`Block ${task.title}`} className="shrink-0">
        {BLOCK_GLYPH}
        Block
      </Button>
    </li>
  );
}
