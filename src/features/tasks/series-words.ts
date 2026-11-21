// What a repeating task says about itself (SCREENS.md §10 "Recurring"): the header line, the pause still running,
// what the rule would become on another day, and the pause picker's days. Free of the web's screen parts, so the
// Android app's task detail says the same (docs/mobile/ANDROID_APP_SPEC.md §4.3); series-controls.tsx draws them.
import { currentOccurrence, followingOccurrence, rebaseRule } from "@/core/recurrence/series";
import { ruleWords } from "@/core/recurrence/words";
import { compareDates, type LocalDate } from "@/core/time";
import { formatDay, weekdayName } from "@/core/time/format-day";
import type { RecurrenceException, Task } from "@/core/types";

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

/** What the rule would read as once it moved to `day` ("every Wednesday"); empty for a task that does not repeat. */
export function rebasedWords(task: Pick<Task, "recurrenceRule" | "recurrenceMode" | "doDate">, day: LocalDate, today: LocalDate, exceptions: readonly RecurrenceException[] = []): string {
  const rule = task.recurrenceRule ?? "";
  return rule ? ruleWords(rebaseRule(rule, currentOccurrence(task.doDate, today, exceptions), day), task.recurrenceMode ?? "fixed") : "";
}

/** "Pause repeats until…": the few days from now it offers before any day. */
export function pauseChoices(today: LocalDate): { label: string; date: LocalDate }[] {
  return [
    { label: "In a week", date: today.add({ days: 7 }) },
    { label: "In two weeks", date: today.add({ days: 14 }) },
    { label: "In a month", date: today.add({ months: 1 }) },
  ];
}
