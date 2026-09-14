"use client";
// The evening shutdown (SCREENS.md §15): six steps in a settled order, 60–90
// seconds, nothing here creates new work. Presentational; the page feeds it
// the day and does the writes.
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Task } from "@/core/types";
import { Icon } from "@/ui/icons";
import { MoveActions } from "@/features/tasks/task-actions";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { SHUTDOWN_STEPS, carriedLine, doneLine, isRating, nextStep, previousStep, tomorrowLine, type ShutdownStep } from "./shutdown";

export type CarryChoice = "tomorrow" | "someday" | "drop";

export interface ShutdownFlowProps {
  done: readonly Task[];
  unfinished: readonly Task[];
  defaultEstimateMin: number;
  rating: number | null;
  highlight: string;
  tomorrow: { spareMin: number | null; planned: number };
  onCarry: (id: string, to: CarryChoice) => void;
  onCarryAll: () => void;
  onRating: (rating: 1 | 2 | 3 | 4 | 5) => void;
  onHighlight: (text: string) => void;
  onPlanTomorrow: () => void;
  /** "Close the day": the flow is complete. */
  onClose: () => void;
  /** Skip ✕: leave now; everything already changed stays changed. */
  onSkip: () => void;
}

const TITLES: Record<ShutdownStep, string> = {
  done: "Done today",
  carried: "Carried to tomorrow",
  rating: "How was the day?",
  highlight: "What was worth it today?",
  tomorrow: "Tomorrow",
  close: "Close the day",
};

export function ShutdownFlow(p: ShutdownFlowProps) {
  const [step, setStep] = useState<ShutdownStep>("done");
  const [highlight, setHighlight] = useState(p.highlight);
  const [seenHighlight, setSeenHighlight] = useState(p.highlight);
  if (seenHighlight !== p.highlight) {
    setSeenHighlight(p.highlight);
    setHighlight(p.highlight);
  }
  const next = nextStep(step);
  const prev = previousStep(step);
  const stepIndex = SHUTDOWN_STEPS.indexOf(step);

  const commitHighlight = () => {
    if (highlight.trim() !== p.highlight.trim()) p.onHighlight(highlight.trim());
  };
  const goNext = () => {
    if (step === "highlight") commitHighlight();
    if (next) setStep(next);
  };

  // 1–5 rate on the rating step; Enter moves on anywhere but a text field.
  const onRating = p.onRating;
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest("input, textarea")) return;
      if (step === "rating" && isRating(Number(e.key))) {
        e.preventDefault();
        onRating(Number(e.key) as 1 | 2 | 3 | 4 | 5);
      } else if (e.key === "Enter" && step !== "close") {
        e.preventDefault();
        const to = nextStep(step);
        if (to) setStep(to);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onRating]);

  const onHighlightKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goNext();
    }
  };

  let body: ReactNode;
  switch (step) {
    case "done":
      body = (
        <>
          <Lead>{doneLine(p.done, p.defaultEstimateMin)}</Lead>
          {p.done.length > 0 && (
            <TaskList>
              {p.done.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </TaskList>
          )}
        </>
      );
      break;
    case "carried":
      body = (
        <>
          <Lead>{carriedLine(p.unfinished.length)}</Lead>
          {p.unfinished.length > 0 && (
            <>
              <TaskList>
                {p.unfinished.map((t) => (
                  <TaskRow key={t.id} task={t} actions={<MoveActions onTomorrow={() => p.onCarry(t.id, "tomorrow")} onSomeday={() => p.onCarry(t.id, "someday")} onDrop={() => p.onCarry(t.id, "drop")} />} />
                ))}
              </TaskList>
              <p className="text-[13px] text-ink-3">Anything you leave here carries to tomorrow on its own.</p>
              <button type="button" onClick={p.onCarryAll} className="self-start text-[13.5px] font-medium text-ink underline decoration-line-strong hover:decoration-ink">
                Move all to tomorrow
              </button>
            </>
          )}
        </>
      );
      break;
    case "rating":
      body = (
        <>
          <Lead>One tap. Skip if you&rsquo;d rather not.</Lead>
          <div role="radiogroup" aria-label="Day rating" className="flex gap-2">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={p.rating === n}
                aria-label={`Rate ${n}`}
                onClick={() => p.onRating(n)}
                className="flex size-12 items-center justify-center rounded-xl border border-line bg-surface font-mono text-[16px] text-ink hover:border-line-strong aria-checked:border-ink aria-checked:bg-ink aria-checked:text-paper"
              >
                {n}
              </button>
            ))}
          </div>
        </>
      );
      break;
    case "highlight":
      body = (
        <>
          <input
            autoFocus
            aria-label="Highlight"
            placeholder="One line is plenty."
            value={highlight}
            onChange={(e) => setHighlight(e.target.value)}
            onBlur={commitHighlight}
            onKeyDown={onHighlightKey}
            className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-[16px] text-ink outline-none focus:border-ink"
          />
          {p.done.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {p.done.slice(0, 6).map((t) => (
                <button key={t.id} type="button" onClick={() => setHighlight(t.title)} className="h-9 max-w-full truncate rounded-full border border-line px-3 text-[13px] text-ink hover:border-line-strong">
                  {t.title}
                </button>
              ))}
            </div>
          )}
        </>
      );
      break;
    case "tomorrow":
      body = (
        <>
          <Lead>{tomorrowLine(p.tomorrow.spareMin, p.tomorrow.planned)}</Lead>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={p.onPlanTomorrow} className="h-11 rounded-xl border border-line bg-surface px-4 text-[15px] font-medium text-ink hover:border-line-strong">
              Plan tomorrow now
            </button>
            <button type="button" onClick={goNext} className="h-11 rounded-xl px-4 text-[15px] text-ink-2 hover:text-ink">
              Plan it in the morning
            </button>
          </div>
        </>
      );
      break;
    case "close":
      body = <Lead>That&rsquo;s the day. Nothing is waiting for you.</Lead>;
      break;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6 pb-28 md:p-10 md:pb-28">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            Evening shutdown · {stepIndex + 1} of {SHUTDOWN_STEPS.length}
          </p>
          <h1 className="font-display text-3xl leading-tight text-ink">{TITLES[step]}</h1>
        </div>
        <div className="flex items-center gap-3">
          <ol className="flex gap-1.5" aria-label="Steps">
            {SHUTDOWN_STEPS.map((s, i) => (
              <li key={s}>
                <button type="button" onClick={() => setStep(s)} aria-label={`Step ${i + 1}: ${TITLES[s]}`} aria-current={s === step ? "step" : undefined} className={`block size-2.5 rounded-full ${i <= stepIndex ? "bg-ink" : "bg-line-strong"}`} />
              </li>
            ))}
          </ol>
          <button type="button" onClick={p.onSkip} aria-label="Skip" className="flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-surface hover:text-ink">
            <Icon name="close" size={18} />
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-4">{body}</section>

      <footer className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-line bg-paper/95 px-6 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <button type="button" onClick={() => prev && setStep(prev)} disabled={!prev} className="h-12 rounded-xl px-4 text-[15px] text-ink-2 hover:text-ink disabled:opacity-0">
          ← Back
        </button>
        {step === "close" ? (
          <button type="button" onClick={p.onClose} className="h-12 rounded-xl bg-ink px-5 text-[15px] font-medium text-paper">
            Close the day
          </button>
        ) : (
          <button type="button" onClick={goNext} className="h-12 rounded-xl bg-ink px-5 text-[15px] font-medium text-paper">
            Next
          </button>
        )}
      </footer>
    </main>
  );
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="text-[17px] leading-relaxed text-ink">{children}</p>;
}
