"use client";
// The evening shutdown (SCREENS.md §15): six steps in a settled order, 60–90
// seconds, nothing here creates new work, and the closing moment is a ledger
// of facts rather than a cheer. Presentational; the page feeds it the day
// and does the writes.
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Task } from "@/core/types";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Input } from "@/ui/field";
import { MoveActions, RowAction } from "@/features/tasks/task-actions";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { RatingSparkline } from "./rating-sparkline";
import type { RatingTrend } from "./rating-trend";
import { Lead, RitualFooter, RitualFrame } from "./ritual-frame";
import { OUTCOME_LABEL, SHUTDOWN_STEPS, carriedLine, carriedToTomorrow, closingLedger, doneLine, isRating, nextStep, previousStep, tomorrowLine, type CarryChoice, type CarryRow, type ShutdownStep } from "./shutdown";
// The titles, the fixed lines and the small rules are in shutdown-words.ts, shared with the Android app.
import { CARRY_CHOICE_LABEL, HIGHLIGHT_PICKS, SHUTDOWN_LABELS as LABELS, SHUTDOWN_TITLES as TITLES, SHUTDOWN_WORDS as WORDS, carryAnswers, highlightToSave, rateLabel, waitingCount } from "./shutdown-words";

export type { CarryChoice } from "./shutdown";

export interface ShutdownFlowProps {
  done: readonly Task[];
  /** The unfinished tasks as they were when the shutdown opened, each with what has become of it since. */
  unfinished: readonly CarryRow[];
  defaultEstimateMin: number;
  rating: number | null;
  /** The last fourteen days' ratings, once five of them are rated (rating-trend.ts); null before. */
  trend?: RatingTrend | null;
  highlight: string;
  tomorrow: { spareMin: number | null; planned: number };
  onCarry: (id: string, to: CarryChoice) => void;
  /** Moves every row still waiting to tomorrow, as one change with one undo. */
  onCarryAll: () => void;
  onRating: (rating: 1 | 2 | 3 | 4 | 5) => void;
  onHighlight: (text: string) => void;
  onPlanTomorrow: () => void;
  /** "Close the day": the flow is complete. */
  onClose: () => void;
  /** Skip ✕: leave now; everything already changed stays changed. */
  onSkip: () => void;
}

const RATING =
  "flex size-11 items-center justify-center rounded-lg border border-line-strong bg-surface text-body font-medium text-ink num transition-[background-color,border-color,color,transform] dur-fast hover:bg-hover motion-safe:active:scale-97 aria-checked:border-ink aria-checked:bg-ink aria-checked:text-ink-inverse";

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
    const text = highlightToSave(highlight, p.highlight);
    if (text !== null) p.onHighlight(text);
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
    case "carried": {
      const waiting = waitingCount(p.unfinished);
      body = (
        <>
          <Lead>{carriedLine(p.unfinished.length)}</Lead>
          {p.unfinished.length > 0 && (
            <>
              <TaskList>
                {p.unfinished.map(({ task: t, outcome }) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    // An answered row stays where it was and says what became of it, in a neutral status chip.
                    chips={
                      outcome && (
                        <Chip size="auto" icon="check" data-testid={`outcome-${t.id}`}>
                          {OUTCOME_LABEL[outcome]}
                        </Chip>
                      )
                    }
                    // Keeping wrote nothing, so the other answers stay open; a settled row offers none (carryAnswers).
                    actions={
                      carryAnswers(outcome).length > 0 ? (
                        <>
                          <MoveActions onTomorrow={() => p.onCarry(t.id, "tomorrow")} onSomeday={() => p.onCarry(t.id, "someday")} onDrop={() => p.onCarry(t.id, "drop")} />
                          {carryAnswers(outcome).includes("keep") && <RowAction label={CARRY_CHOICE_LABEL.keep} onClick={() => p.onCarry(t.id, "keep")} />}
                        </>
                      ) : undefined
                    }
                  />
                ))}
              </TaskList>
              {waiting > 0 && (
                <>
                  <p className="text-body-sm text-pretty text-ink-3">{WORDS.carryNote}</p>
                  <Button variant="link" className="-ml-2 self-start" onClick={p.onCarryAll}>
                    {WORDS.carryAll}
                  </Button>
                </>
              )}
            </>
          )}
        </>
      );
      break;
    }
    case "rating":
      body = (
        <>
          <Lead>{WORDS.ratingLead}</Lead>
          <div role="radiogroup" aria-label={WORDS.ratingGroup} className="flex flex-wrap gap-2">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={p.rating === n} aria-label={rateLabel(n)} onClick={() => p.onRating(n)} className={RATING}>
                {n}
              </button>
            ))}
          </div>
          {p.trend && <RatingSparkline trend={p.trend} className="mt-2" />}
        </>
      );
      break;
    case "highlight":
      body = (
        <>
          <Input size="touch" autoFocus aria-label={WORDS.highlightLabel} placeholder={WORDS.highlightHint} value={highlight} onChange={(e) => setHighlight(e.target.value)} onBlur={commitHighlight} onKeyDown={onHighlightKey} />
          {p.done.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {p.done.slice(0, HIGHLIGHT_PICKS).map((t) => (
                <Button key={t.id} variant="secondary" className="max-w-full" onClick={() => setHighlight(t.title)}>
                  <span className="min-w-0 truncate">{t.title}</span>
                </Button>
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
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={p.onPlanTomorrow}>
              {WORDS.planNow}
            </Button>
            <Button variant="quiet" onClick={goNext}>
              {WORDS.planMorning}
            </Button>
          </div>
        </>
      );
      break;
    case "close":
      body = (
        <>
          <Lead>{WORDS.closeLead}</Lead>
          <dl className="divide-y divide-line rounded-xl border border-line bg-surface">
            {closingLedger({ done: p.done, carried: carriedToTomorrow(p.unfinished), defaultEstimateMin: p.defaultEstimateMin, rating: p.rating, highlight, tomorrow: p.tomorrow }).map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 px-4 py-2.5 sm:py-3">
                <dt className="shrink-0 text-body text-ink-2">{row.label}</dt>
                <dd className={cx("min-w-0 text-right text-body font-medium num [overflow-wrap:anywhere]", row.tone === "spare" ? "font-semibold text-spare" : row.tone === "over" ? "font-semibold text-over" : row.tone === "quiet" ? "text-ink-3" : "text-ink")}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </>
      );
      break;
  }

  return (
    <RitualFrame
      eyebrow={
        <>
          {WORDS.eyebrow} · <span className="num">{stepIndex + 1}</span> of <span className="num">{SHUTDOWN_STEPS.length}</span>
        </>
      }
      title={TITLES[step]}
      steps={{ labels: LABELS, index: stepIndex, onStep: (i) => setStep(SHUTDOWN_STEPS[i]) }}
      onSkip={p.onSkip}
      footer={<RitualFooter onBack={() => prev && setStep(prev)} canGoBack={prev !== null} primary={step === "close" ? { label: WORDS.close, onClick: p.onClose } : { label: WORDS.next, onClick: goNext }} />}
    >
      {body}
    </RitualFrame>
  );
}
