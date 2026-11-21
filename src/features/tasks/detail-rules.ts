// The task detail's own rules and words (SCREENS.md §10), apart from how they are drawn: the choices a field offers,
// what a typed repeat does, when a new day asks "just this once or change the rule", which actions a task's state
// leaves open. Free of the web's screen parts, so the web's panel (task-detail-panel.tsx) and the Android app's task
// detail decide the same things from one place (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import type { TypedDate } from "@/core/quickadd/read-date";
import { ruleToSpec, specToRule } from "@/core/quickadd/recurrence";
import { occurrencesAfter } from "@/core/recurrence";
import { compareDates, formatTime, localTime, type LocalDate, type LocalTime } from "@/core/time";
import type { MissPolicy, Priority, RecurrenceMode, TagRef, Task } from "@/core/types";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { dayLabel } from "@/features/quickadd/day-label";
import { repeatPolicy } from "./repeat-policy";

/** The new day of an occurrence as the Do field picked it, with the time and evening flag that came with it. */
export interface SeriesDayChange {
  doDate: LocalDate;
  doTime?: LocalTime | null;
  evening?: boolean;
}

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 0, label: "None" },
  { value: 3, label: "!1 High" },
  { value: 2, label: "!2 Medium" },
  { value: 1, label: "!3 Low" },
];
export const MISS_POLICIES: { value: MissPolicy; label: string; help: string }[] = [
  { value: "carry", label: "Carry over", help: "It moves to the next day and counts as carried." },
  { value: "skip", label: "Skip this one", help: "Suits routines — a missed one just doesn't count." },
  { value: "expire", label: "Expire", help: "It goes to the Logbook as missed." },
];

/** What a task's state leaves open: which of the footer's and the menu's actions are offered. */
export function detailActions(task: Pick<Task, "state" | "recurrenceRule">) {
  const done = task.state === "done";
  return {
    done,
    someday: task.state !== "someday" && !done,
    drop: task.state !== "dropped",
    /** An open or parked task can become a project; a finished, dropped or archived one cannot. */
    convert: !done && task.state !== "dropped" && task.state !== "archived",
    /** Still open: it can be filed and tagged from the menu. */
    open: task.state === "inbox" || task.state === "active" || task.state === "someday",
    /** Its repeat still runs: the header line, Skip this occurrence and the pause are its own. */
    repeating: Boolean(task.recurrenceRule) && !done,
    /** Where "Tasks like this usually take you …" may be said: on a task still to be done. */
    usual: !done && task.state !== "dropped",
  };
}

// ---- Do, Deadline, Starts

/** The day a typed date resolved to, as it shows under the box: "Tomorrow", and on the Do field "Fri 27 Nov 15:00" or "Today, evening". */
export function typedDateWords(read: TypedDate, today: LocalDate, withTime: boolean): string {
  return `${dayLabel(read.date, today)}${withTime ? (read.time ? ` ${formatTime(read.time)}` : read.evening ? ", evening" : "") : ""}`;
}

/** What a typed date applies: a field without a time (Deadline, Starts) takes the day alone. */
export function typedDateValue(read: TypedDate, withTime: boolean): TypedDate {
  return withTime ? read : { ...read, time: null, evening: false };
}

/** A time set or cleared in the Do field ("HH:MM", or "" for none): a task with no day yet is for today. */
export function timePatch(task: Pick<Task, "doDate">, value: string, today: LocalDate): TaskPatch {
  return { doTime: value ? localTime(value) : null, ...(value && !task.doDate ? { doDate: today } : {}) };
}

/**
 * A new do-date on a repeating task asks first: just this once, or change the rule (SCREENS.md §10). The time alone,
 * the evening flag alone and clearing the day are not asked (DECISIONS.md "Time-only change on a repeat").
 */
export function asksSeriesDay(task: Pick<Task, "recurrenceRule" | "doDate" | "state">, canAsk: boolean): boolean {
  return Boolean(task.recurrenceRule && task.doDate && canAsk && task.state !== "done");
}

/** Whether `patch` moves the task to another day: with `asksSeriesDay`, the change that is asked about. */
export function movesDay(task: Pick<Task, "doDate">, patch: TaskPatch): patch is TaskPatch & { doDate: LocalDate } {
  return Boolean(patch.doDate && task.doDate && !patch.doDate.equals(task.doDate));
}

/** Both dates stay as set (PRODUCT_SPEC.md §5.4); a deadline before the do-date is only said, with "Do it by then". */
export function dueBeforeDo(task: Pick<Task, "deadline" | "doDate" | "state">): boolean {
  return task.state !== "done" && task.deadline != null && task.doDate != null && compareDates(task.deadline, task.doDate) < 0;
}

// ---- Repeat

/** The Repeat field's value: "every 2 weeks on wed", with ", after completion" when it counts from there. */
export function repeatValue(task: Pick<Task, "recurrenceRule" | "recurrenceMode">): string | null {
  return task.recurrenceRule ? `every ${ruleToSpec(task.recurrenceRule)}${task.recurrenceMode === "after_completion" ? ", after completion" : ""}` : null;
}

/** The next three days the repeat lands on, for the panel's "Next:" line. */
export function nextRepeats(task: Pick<Task, "recurrenceRule" | "doDate">, today: LocalDate): LocalDate[] {
  if (!task.recurrenceRule) return [];
  return occurrencesAfter(task.recurrenceRule, task.doDate ?? today, today, 3);
}

/** A rule typed in words ("every weekday", "2 weeks on wed"), or null when the words are not one. */
export function readRepeat(spec: string): { rule: string; length: number } | null {
  return specToRule(spec.trim().replace(/^every\s+/i, ""));
}

export type RepeatChange = { kind: "rule"; rule: string; mode: RecurrenceMode } | { kind: "patch"; patch: TaskPatch };

/**
 * What a rule read from the Repeat field does. A task that already repeats changes its rule, and the series starts
 * again from today (SYSTEM_DESIGN.md §5.2), where the series can be edited (`canChangeRule`); the same rule again
 * changes nothing (null). Otherwise it is a plain patch, with the miss policy that follows a first repeat.
 */
export function repeatChange(task: Pick<Task, "recurrenceRule" | "recurrenceMode" | "missPolicy">, rule: string, canChangeRule: boolean): RepeatChange | null {
  if (task.recurrenceRule && canChangeRule) return rule !== task.recurrenceRule ? { kind: "rule", rule, mode: task.recurrenceMode ?? "fixed" } : null;
  return { kind: "patch", patch: { recurrenceRule: rule, recurrenceMode: task.recurrenceMode ?? "fixed", ...repeatPolicy(task, rule) } };
}

/** Never: the repeat stops, and a policy that followed it goes back with it. */
export function stopRepeat(task: Pick<Task, "recurrenceRule" | "missPolicy">): TaskPatch {
  return { recurrenceRule: null, recurrenceMode: null, ...repeatPolicy(task, null) };
}

// ---- Tags and the history line

/** The name typed into the Tags box: a leading @ dropped. Empty when there is nothing to add. */
export function tagDraft(draft: string): string {
  return draft.trim().replace(/^@/, "");
}

/** The space's tags the task does not have yet: what the Tags box suggests. */
export function unattachedTags(allTags: readonly TagRef[], tags: readonly TagRef[]): TagRef[] {
  const attached = new Set(tags.map((t) => t.id));
  return allTags.filter((t) => !attached.has(t.id));
}

/** "Carried over 3 times, last yesterday"; null for a task that never was. */
export function carriedWords(task: Pick<Task, "carryCount" | "lastCarriedAt">, today: LocalDate): string | null {
  if (!(task.carryCount > 0 || task.lastCarriedAt)) return null;
  return `Carried over ${task.carryCount} ${task.carryCount === 1 ? "time" : "times"}${task.lastCarriedAt ? `, last ${dayLabel(task.lastCarriedAt, today).toLowerCase()}` : ""}`;
}
