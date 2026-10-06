"use client";
// The task detail's controls for a repeating task (SCREENS.md §10 "Recurring";
// SYSTEM_DESIGN.md §5.2 "Series edits"): the header line ("Repeats every
// Monday · next Mon 16", or "Paused until Mon 12 Oct" with Resume), the
// question a new do-date asks (Just this once · Change the rule), and the
// pause picker. Part of the detail's lazy island, with the recurrence engine.
import { useEffect, useRef, useState } from "react";
import { currentOccurrence, followingOccurrence, rebaseRule } from "@/core/recurrence/series";
import { ruleWords } from "@/core/recurrence/words";
import { compareDates, localDate, type LocalDate } from "@/core/time";
import { formatDay, weekdayName } from "@/core/time/format-day";
import type { RecurrenceException, Task } from "@/core/types";
import { Button } from "@/ui/button";
import { chipButtonClass } from "@/ui/chip";
import { DateField } from "@/ui/date-field";
import { Icon } from "@/ui/icons";

/** "today", "tomorrow", "Mon 16" within four weeks, else "Mon 16 Nov". */
export function shortDay(day: LocalDate, today: LocalDate): string {
  const days = day.since(today, { largestUnit: "days" }).days;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1 && days < 28) return `${weekdayName(day)} ${day.day}`;
  return formatDay(day, { today });
}

/** The pause still running on `today`, or null. */
export function pausedUntil(task: Pick<Task, "recurrencePausedUntil">, today: LocalDate): LocalDate | null {
  const until = task.recurrencePausedUntil;
  return until && compareDates(until, today) > 0 ? until : null;
}

/** "Repeats every Monday · next Mon 16": the rule in words and the occurrence after the current one. */
export function repeatSummary(task: Pick<Task, "recurrenceRule" | "recurrenceMode" | "doDate">, today: LocalDate, exceptions: readonly RecurrenceException[] = []): string | null {
  if (!task.recurrenceRule) return null;
  const mode = task.recurrenceMode ?? "fixed";
  let next: LocalDate | null = null;
  try {
    next = followingOccurrence({ rule: task.recurrenceRule, mode, occurrence: currentOccurrence(task.doDate, today, exceptions), today, exceptions });
  } catch {
    // A rule the engine cannot read still gets its words.
  }
  return `Repeats ${ruleWords(task.recurrenceRule, mode)}${next ? ` · next ${shortDay(next, today)}` : ""}`;
}

/** The header line under the title: what the repeat does next, or the pause and the way out of it. */
export function RepeatLine({ task, today, exceptions, onResume }: { task: Task; today: LocalDate; exceptions?: readonly RecurrenceException[]; onResume?: () => void }) {
  if (!task.recurrenceRule) return null;
  const paused = pausedUntil(task, today);
  return (
    <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-body-sm text-ink-2 num">
      <Icon name="routines" size={13} className="shrink-0 text-ink-3" />
      {paused ? (
        <>
          <span>Paused until {formatDay(paused, { today })}</span>
          {onResume && (
            <Button variant="link" size="compact" className="-my-2 text-ink-2 sm:my-0" onClick={onResume}>
              Resume
            </Button>
          )}
        </>
      ) : (
        <span className="min-w-0">{repeatSummary(task, today, exceptions)}</span>
      )}
    </p>
  );
}

/**
 * Asked when the Do date of a repeating task changes (SCREENS.md §10): move only this occurrence, or move the rule
 * to the new day ("every Wednesday from then"). Two 44 px buttons; inside the Do field's bottom sheet on a phone.
 */
export function SeriesPrompt({
  task,
  day,
  today,
  exceptions = [],
  autoFocus = false,
  onOnce,
  onRule,
}: {
  task: Task;
  day: LocalDate;
  today: LocalDate;
  exceptions?: readonly RecurrenceException[];
  autoFocus?: boolean;
  onOnce: () => void;
  onRule: () => void;
}) {
  const rule = task.recurrenceRule ?? "";
  const rebased = rule ? ruleWords(rebaseRule(rule, currentOccurrence(task.doDate, today, exceptions), day), task.recurrenceMode ?? "fixed") : "";
  // It opens at the foot of the Do sheet: on a short phone that is below the fold, so it brings itself into view.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "nearest" });
  }, []);
  return (
    <div ref={ref} role="group" aria-label="This occurrence or the rule" className="flex flex-col gap-2 border-t border-line pt-3">
      <p className="text-body text-ink">
        Move to {formatDay(day, { today })}: just this once, or change the rule?
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" autoFocus={autoFocus} onClick={onOnce}>
          Just this once
        </Button>
        <Button variant="secondary" className="flex-1" onClick={onRule}>
          Change the rule
        </Button>
      </div>
      {rebased && <p className="text-body-sm text-ink-2">Changing the rule makes it repeat {rebased} from then.</p>}
    </div>
  );
}

/** "Pause repeats until…": a few days from now, or any day; the task is hidden until its schedule's first day from then. */
export function PausePicker({ today, onPause }: { today: LocalDate; onPause: (until: LocalDate) => void }) {
  const [day, setDay] = useState("");
  const choices = [
    { label: "In a week", date: today.add({ days: 7 }) },
    { label: "In two weeks", date: today.add({ days: 14 }) },
    { label: "In a month", date: today.add({ months: 1 }) },
  ];
  return (
    <div role="group" aria-label="Pause repeats until" className="flex flex-col gap-2">
      <p className="text-body-sm text-ink-2">Pause repeats until</p>
      <div className="flex flex-wrap gap-1.5">
        {choices.map((c, i) => (
          <button key={c.label} type="button" data-autofocus={i === 0 ? true : undefined} className={chipButtonClass()} onClick={() => onPause(c.date)}>
            {c.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-body-sm text-ink-2">
        <span className="shrink-0">Until</span>
        <DateField
          aria-label="Pause until"
          className="flex-1"
          today={today}
          value={day}
          min={today.add({ days: 1 }).toString()}
          onChange={(e) => setDay(e.target.value)}
        />
        <Button variant="secondary" disabled={!day || compareDates(localDate(day), today) <= 0} onClick={() => day && onPause(localDate(day))}>
          Pause
        </Button>
      </label>
    </div>
  );
}
