"use client";
// The morning plan (SCREENS.md §14): three steps, one spare number, and an
// always-available Skip. Presentational; the page feeds it the day and does
// the writes as choices are made.
import type { TimelineMeeting } from "@/features/today/hooks/use-today";
import { useId, useState, type ReactNode } from "react";
import type { Capacity } from "@/core/capacity";
import { formatMinutes, type Instant, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { Button } from "@/ui/button";
import { Chip, DeadlineChip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { ListCard } from "@/ui/list-card";
import { SectionLabel } from "@/ui/section-label";
import { dayChip } from "@/features/tasks/day-chip";
import { DayChipTag, MoveActions } from "@/features/tasks/task-actions";
import { Timeline } from "@/features/today/timeline";
import { PLAN_STEPS, easiestMove, readout, type Candidates, type PlanStep } from "./morning-plan";
import { PlanHero } from "./plan-hero";
import { RitualFooter, RitualFrame } from "./ritual-frame";

export interface MorningPlanFlowProps {
  /** Today's titled meetings for the timeline; optional, the drawing says Busy without them. */
  meetings?: readonly TimelineMeeting[];
  capacity: Capacity | null;
  /** The picker's groups, frozen when the flow opened so rows do not jump as choices are made. */
  groups: Candidates;
  /** Tasks currently on today (picked), including ones ticked during this flow. */
  onToday: readonly Task[];
  fitsMin: number;
  tomorrowSpareMin: number | null;
  defaultEstimateMin: number;
  carryAskAfter: number;
  today: LocalDate;
  now: Instant;
  zone: string;
  onPick: (task: Task, picked: boolean) => void;
  onCarry: (id: string, to: "today" | "tomorrow" | "someday" | "drop") => void;
  onMoveToTomorrow: (id: string) => void;
  onDone: () => void;
  onSkip: () => void;
}

const TITLES: Record<PlanStep, string> = { frame: "Here’s your day", pick: "Pick today’s tasks", block: "Block time" };
const LABELS = PLAN_STEPS.map((s) => TITLES[s]);

export function MorningPlanFlow(p: MorningPlanFlowProps) {
  const [step, setStep] = useState<PlanStep>("frame");
  const [showAll, setShowAll] = useState(false);
  const [keptAnyway, setKeptAnyway] = useState<string | null>(null);
  const index = PLAN_STEPS.indexOf(step);
  const picked = new Set(p.onToday.map((t) => t.id));
  const r = readout(p.onToday, p.fitsMin, p.defaultEstimateMin);
  const move = easiestMove(p.onToday, r.overMin, p.tomorrowSpareMin, p.defaultEstimateMin);
  const coachMove = move && keptAnyway !== move.task.id ? move : null;
  const c = p.capacity;

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
      const projects = showAll ? p.groups.fromProjects : p.groups.fromProjects.slice(0, 6);
      body = (
        <>
          <p className="text-body-lg text-pretty text-ink-2">Tick what you&rsquo;ll work on. Everything else waits without turning red.</p>
          <Group title="Carried over" count={p.groups.carried.length}>
            {p.groups.carried.map((t) => (
              <PickRow
                key={t.id}
                task={t}
                picked={picked.has(t.id)}
                today={p.today}
                onPick={p.onPick}
                defaultEstimateMin={p.defaultEstimateMin}
                actions={<MoveActions onToday={() => p.onCarry(t.id, "today")} onTomorrow={() => p.onCarry(t.id, "tomorrow")} onSomeday={() => p.onCarry(t.id, "someday")} onDrop={() => p.onCarry(t.id, "drop")} />}
                footer={
                  t.carryCount >= p.carryAskAfter && !picked.has(t.id) ? (
                    <p className="px-4 pb-2.5 pl-14 text-body-sm text-pretty text-over sm:pl-11">Carried over {t.carryCount === 3 ? "three" : t.carryCount} times — still want this?</p>
                  ) : null
                }
              />
            ))}
          </Group>
          <Group title="Due this week" count={p.groups.dueThisWeek.length}>
            {p.groups.dueThisWeek.map((t) => (
              <PickRow key={t.id} task={t} picked={picked.has(t.id)} today={p.today} onPick={p.onPick} defaultEstimateMin={p.defaultEstimateMin} />
            ))}
          </Group>
          <Group title="From your projects" count={p.groups.fromProjects.length}>
            {projects.map((t) => (
              <PickRow key={t.id} task={t} picked={picked.has(t.id)} today={p.today} onPick={p.onPick} defaultEstimateMin={p.defaultEstimateMin} />
            ))}
            {!showAll && p.groups.fromProjects.length > 6 && (
              <li className="border-t border-line px-4 py-1">
                <Button variant="link" className="-ml-2 text-ink-2" onClick={() => setShowAll(true)}>
                  More · {p.groups.fromProjects.length - 6}
                </Button>
              </li>
            )}
          </Group>
          <div className={cx("rounded-xl border p-4", r.overMin > 0 ? "border-over-line bg-over-soft" : "border-line bg-surface")} role="status" aria-live="polite">
            <p className="text-body font-medium text-ink num">{r.line}</p>
            {r.coach && <p className="mt-1.5 text-body text-pretty text-ink-2">{r.coach}</p>}
            {coachMove && (
              <div className={cx("mt-3 flex flex-col gap-2 border-t pt-3", r.overMin > 0 ? "border-over-line" : "border-line")}>
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
            )}
          </div>
          <p className="text-body-sm text-pretty text-ink-3">Evening tasks aren&rsquo;t counted here — they get their own time after work.</p>
        </>
      );
      break;
    }
    case "block":
      body = (
        <>
          <p className="text-body-lg text-pretty text-ink-2">Your day as it stands. Dragging tasks onto it arrives with time blocking; for now the plan is the list.</p>
          {c && c.state !== "no_work_day" ? (
            <div className="overflow-hidden rounded-xl border border-line bg-surface bg-daylight px-3 py-4 sm:px-4">
              <Timeline c={c} now={p.now} zone={p.zone} meetings={p.meetings} />
            </div>
          ) : (
            <p className="text-body-lg text-ink-3">No working hours today.</p>
          )}
        </>
      );
      break;
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
          primary={step === "block" ? { label: "Done", onClick: p.onDone } : { label: step === "frame" ? "Next" : "Next · Block time", onClick: () => setStep(PLAN_STEPS[index + 1]) }}
        />
      }
    >
      {body}
    </RitualFrame>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel count={count}>{title}</SectionLabel>
      {count === 0 ? <p className="text-body text-ink-3">Nothing here.</p> : <ListCard>{children}</ListCard>}
    </section>
  );
}

/**
 * A row of the picker, in the task row's clothes: the tick where the ring
 * would be, the title (the tick's label, so it toggles too), the chips in
 * the family's tones, and on carried rows the move actions, inline from
 * `sm` and on a row of their own on the phone. `footer` is the gentle ask.
 */
function PickRow({
  task,
  picked,
  today,
  onPick,
  defaultEstimateMin,
  actions,
  footer,
}: {
  task: Task;
  picked: boolean;
  today: LocalDate;
  onPick: (task: Task, picked: boolean) => void;
  defaultEstimateMin: number;
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
      <Chip tone={task.estimateMin ? "neutral" : "guess"} size="auto">
        {formatMinutes(task.estimateMin ?? defaultEstimateMin)}
        {task.estimateMin == null && "?"}
      </Chip>
    </>
  );
  return (
    <li className="border-t border-line transition-colors dur-fast first:border-t-0 hover:bg-hover">
      <div className={cx("flex min-h-14 items-center gap-x-3 py-2 pr-4 sm:grid sm:min-h-11 sm:gap-x-0 sm:py-0 sm:pr-0", actions ? "sm:grid-cols-[44px_minmax(0,1fr)_auto_auto]" : "sm:grid-cols-[44px_minmax(0,1fr)_auto]")}>
        <span className="flex size-11 shrink-0 items-center justify-center">
          <input id={id} type="checkbox" checked={picked} onChange={(e) => onPick(task, e.target.checked)} aria-label={`Pick ${task.title}`} className="size-[18px] accent-ink" />
        </span>
        {/* The body stacks title and chips on a phone; from `sm` it dissolves and they become grid cells. */}
        <div className="min-w-0 flex-1 sm:contents">
          <label htmlFor={id} className="block min-w-0 sm:flex sm:min-h-11 sm:items-center sm:pr-3">
            <span className="line-clamp-2 text-body-lg leading-snug text-ink [overflow-wrap:anywhere] sm:line-clamp-1 sm:leading-5">{task.title}</span>
          </label>
          <div className="mt-0.5 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-label text-ink-2 num max-sm:fade-end sm:contents">
            <span className={cx("flex shrink-0 items-center gap-1.5 sm:justify-end sm:pr-4 sm:text-body-sm", !actions && "sm:pr-4")}>{chips}</span>
          </div>
        </div>
        {actions && <div className="hidden items-center justify-end gap-0.5 pr-2 sm:flex">{actions}</div>}
      </div>
      {actions && <div className="-mt-1 flex flex-wrap items-center gap-0.5 px-2 pb-1 pl-12 sm:hidden">{actions}</div>}
      {footer}
    </li>
  );
}
