"use client";
// The morning plan (SCREENS.md §14): three steps, a persistent spare-time
// readout, and an always-available Skip. Presentational; the page feeds it
// the day and does the writes as choices are made.
import { VIEW_COLUMN } from "@/features/shell/view-header";
import { cx } from "@/ui/cx";
import { useState, type ReactNode } from "react";
import type { Capacity } from "@/core/capacity";
import { formatMinutes, formatTime, timeFromMinutes, type Instant, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { Icon } from "@/ui/icons";
import { dayChip } from "@/features/tasks/day-chip";
import { DayChipTag, MoveActions } from "@/features/tasks/task-actions";
import { Ribbon } from "@/features/today/ribbon";
import { Timeline } from "@/features/today/timeline";
import { PLAN_STEPS, easiestMove, readout, type Candidates, type PlanStep } from "./morning-plan";

export interface MorningPlanFlowProps {
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
  const workLabel = c && c.state !== "no_work_day" ? `${formatTime(timeFromMinutes(c.windows[0].start))} – ${formatTime(timeFromMinutes(c.windows[c.windows.length - 1].end))}` : "No working hours today";

  let body: ReactNode;
  switch (step) {
    case "frame":
      body = (
        <>
          {c && <Ribbon c={c} />}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="Working hours" value={workLabel} />
            <Fact label="Meetings" value={c ? `${c.busy.length} · ${formatMinutes(c.busyMin)}` : "—"} />
            <Fact label="Spare" value={c && c.state !== "no_work_day" ? formatMinutes(Math.max(0, c.spareMin)) : "—"} />
            <Fact label="Carried over" value={String(p.groups.carried.length)} />
          </dl>
          <p className="text-[15px] text-ink-2">Nothing to do here but read. The next step is the only decision of the morning.</p>
        </>
      );
      break;
    case "pick": {
      const projects = showAll ? p.groups.fromProjects : p.groups.fromProjects.slice(0, 6);
      body = (
        <>
          <p className="text-[15px] text-ink-2">Tick what you&rsquo;ll work on. Everything else waits without turning red.</p>
          <Group title="Carried over" count={p.groups.carried.length}>
            {p.groups.carried.map((t) => (
              <PickRow key={t.id} task={t} picked={picked.has(t.id)} today={p.today} onPick={p.onPick} defaultEstimateMin={p.defaultEstimateMin}>
                <MoveActions onToday={() => p.onCarry(t.id, "today")} onTomorrow={() => p.onCarry(t.id, "tomorrow")} onSomeday={() => p.onCarry(t.id, "someday")} onDrop={() => p.onCarry(t.id, "drop")} />
                {t.carryCount >= p.carryAskAfter && !picked.has(t.id) && (
                  <p className="basis-full pl-8 text-[13px] text-over">
                    Carried over {t.carryCount === 3 ? "three" : t.carryCount} times — still want this?
                  </p>
                )}
              </PickRow>
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
              <li className="px-4 py-2">
                <button type="button" onClick={() => setShowAll(true)} className="text-[13.5px] text-ink-2 underline decoration-line-strong hover:text-ink">
                  More · {p.groups.fromProjects.length - 6}
                </button>
              </li>
            )}
          </Group>
          <div className={`rounded-2xl border p-4 ${r.overMin > 0 ? "border-over-fill bg-over-soft/40" : "border-line bg-surface"}`} role="status" aria-live="polite">
            <p className="font-mono text-[13px] text-ink">{r.line}</p>
            {r.coach && <p className="mt-2 text-[14px] text-ink-2">{r.coach}</p>}
            {coachMove && (
              <div className="mt-3 flex flex-col gap-2 border-t border-line/60 pt-3">
                <p className="text-[14px] text-ink">
                  <span className="font-medium">Easiest move</span> · {coachMove.task.title} · {formatMinutes(coachMove.task.estimateMin ?? p.defaultEstimateMin)}
                  {coachMove.task.estimateMin == null && "?"}
                </p>
                <p className="text-[13.5px] text-ink-2">{coachMove.reason}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => p.onMoveToTomorrow(coachMove.task.id)} className="h-9 rounded-lg bg-ink px-3 text-[13px] font-medium text-paper">
                    Move to tomorrow
                  </button>
                  <button type="button" onClick={() => setKeptAnyway(coachMove.task.id)} className="h-9 rounded-lg px-3 text-[13px] text-ink-2 hover:text-ink">
                    Keep it anyway
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className="text-[12.5px] text-ink-3">Evening tasks aren&rsquo;t counted here — they get their own time after work.</p>
        </>
      );
      break;
    }
    case "block":
      body = (
        <>
          <p className="text-[15px] text-ink-2">Your day as it stands. Dragging tasks onto it arrives with time blocking; for now the plan is the list.</p>
          {c && c.state !== "no_work_day" ? <Timeline c={c} now={p.now} zone={p.zone} /> : <p className="text-ink-3">No working hours today.</p>}
        </>
      );
      break;
  }

  return (
    <main className={cx(VIEW_COLUMN, "min-h-dvh pb-28 md:pb-28")}>
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            Morning plan · {index + 1} of {PLAN_STEPS.length}
          </p>
          <h1 className="font-display text-3xl leading-tight text-ink">{TITLES[step]}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[12px] text-ink-2 sm:inline" aria-live="polite">
            {r.overMin > 0 ? `${formatMinutes(r.overMin)} over` : `${formatMinutes(r.fitsMin - r.pickedMin)} spare`}
          </span>
          <ol className="flex gap-1.5" aria-label="Steps">
            {PLAN_STEPS.map((s, i) => (
              <li key={s}>
                <button type="button" onClick={() => setStep(s)} aria-label={`Step ${i + 1}: ${TITLES[s]}`} aria-current={s === step ? "step" : undefined} className={`block size-2.5 rounded-full ${i <= index ? "bg-ink" : "bg-line-strong"}`} />
              </li>
            ))}
          </ol>
          <button type="button" onClick={p.onSkip} aria-label="Skip" className="flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-surface hover:text-ink">
            <Icon name="close" size={18} />
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-4">{body}</section>

      <footer className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-line bg-paper/95 px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <button type="button" onClick={() => index > 0 && setStep(PLAN_STEPS[index - 1])} disabled={index === 0} className="h-12 rounded-xl px-4 text-[15px] text-ink-2 hover:text-ink disabled:opacity-0">
          ← Back
        </button>
        {step === "block" ? (
          <button type="button" onClick={p.onDone} className="h-12 rounded-xl bg-ink px-5 text-[15px] font-medium text-paper">
            Done
          </button>
        ) : (
          <button type="button" onClick={() => setStep(PLAN_STEPS[index + 1])} className="h-12 rounded-xl bg-ink px-5 text-[15px] font-medium text-paper">
            {step === "frame" ? "Next" : "Next · Block time"}
          </button>
        )}
      </footer>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <dt className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</dt>
      <dd className="mt-1 font-mono text-[15px] text-ink">{value}</dd>
    </div>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {title} <span className="ml-2 font-mono normal-case tracking-normal">{count}</span>
      </h2>
      {count === 0 ? <p className="px-4 text-[14px] text-ink-3">Nothing here.</p> : <ul className="rounded-xl border border-line bg-surface">{children}</ul>}
    </section>
  );
}

function PickRow({ task, picked, today, onPick, defaultEstimateMin, children }: { task: Task; picked: boolean; today: LocalDate; onPick: (task: Task, picked: boolean) => void; defaultEstimateMin: number; children?: ReactNode }) {
  return (
    <li className="flex min-h-11 flex-wrap items-center gap-3 border-t border-line px-4 py-2 first:border-t-0">
      <input type="checkbox" checked={picked} onChange={(e) => onPick(task, e.target.checked)} aria-label={`Pick ${task.title}`} className="size-5 shrink-0 accent-ink" />
      <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{task.title}</span>
      {!picked && <DayChipTag chip={dayChip(task, today)} />}
      {task.deadline && <span className="rounded-md bg-deadline-soft px-2 py-0.5 text-xs font-medium text-deadline">Due {task.deadline.toString().slice(5)}</span>}
      <span className={`rounded-md px-2 py-0.5 font-mono text-xs text-ink-2 ${task.estimateMin ? "bg-surface-2" : "border border-dashed border-line-strong"}`}>
        {formatMinutes(task.estimateMin ?? defaultEstimateMin)}
        {task.estimateMin == null && "?"}
      </span>
      {task.carryCount > 0 && <span className="font-mono text-xs text-ink-3">×{task.carryCount}</span>}
      {children}
    </li>
  );
}
