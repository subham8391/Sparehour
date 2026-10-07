// Inbox triage (SCREENS.md §5): the choices a task can be given, the one write each makes, and the Triage all
// keys (DECISIONS.md "Triage all keys"). Shared by the expanded row, the phone's ⋯ menu and the walker.
import type { LocalDate } from "@/core/time";
import type { TaskRepo } from "@/data/repositories/task-repo";

/** Where a task goes. Each leaves the Inbox with an undo toast (PRODUCT_SPEC.md §7 "triage"). */
export type TriageChoice = "today" | "tomorrow" | "week" | "someday" | "drop";
/** What a task is given without deciding where it goes yet: a project or a deadline files it, an estimate alone does not. */
export type TriageField = "project" | "estimate" | "deadline";
export type TriageAction = TriageChoice | TriageField;

export const TRIAGE_LABEL: Record<TriageAction, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  someday: "Someday",
  drop: "Drop",
  project: "Project",
  estimate: "Estimate",
  deadline: "Deadline",
};

/** The key beside each action's name ("Today (T)"); "This week" has none (SCREENS.md §24). */
export const TRIAGE_KEY: Partial<Record<TriageAction, string>> = {
  today: "T",
  tomorrow: "Shift+T",
  someday: "S",
  drop: "Backspace",
  project: "#",
  estimate: "E",
  deadline: "Shift+D",
};

/**
 * The write for a choice. "This week" has no day (DECISIONS.md, M1 gap rulings): the task becomes active and
 * undated, so it lands in Upcoming's Not yet planned rail to be put on a day.
 */
export function triage(repo: TaskRepo, id: string, choice: TriageChoice, today: LocalDate): Promise<void> {
  switch (choice) {
    case "today":
      return repo.update(id, { doDate: today, doTime: null, evening: false }, "Moved {title} to today");
    case "tomorrow":
      return repo.update(id, { doDate: today.add({ days: 1 }), doTime: null, evening: false }, "Moved {title} to tomorrow");
    case "week":
      return repo.setState(id, "active", "Moved {title} to this week");
    case "someday":
      return repo.setState(id, "someday");
    case "drop":
      return repo.setState(id, "dropped");
  }
}

/** What a key does in Triage all: an action, a step through the queue, or leaving. */
export type WalkKey = { act: TriageAction } | { step: 1 | -1 } | { leave: true } | { undo: true };

/**
 * Triage all's keys (DECISIONS.md "Triage all keys"): T, ⇧T, S, Backspace, #, E and ⇧D as in SCREENS.md §24;
 * → or J (or ↓) skips to the next task and leaves this one in the Inbox, K or ↑ goes back, Esc leaves, ⌘Z undoes.
 */
export function walkKey(e: { key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): WalkKey | null {
  if (e.altKey) return null;
  if (e.metaKey || e.ctrlKey) return e.key.toLowerCase() === "z" && !e.shiftKey ? { undo: true } : null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "t") return { act: e.shiftKey ? "tomorrow" : "today" };
  if (k === "s" && !e.shiftKey) return { act: "someday" };
  if (k === "Backspace" || k === "Delete") return { act: "drop" };
  if (k === "#") return { act: "project" };
  if (k === "e" && !e.shiftKey) return { act: "estimate" };
  if (k === "d" && e.shiftKey) return { act: "deadline" };
  if (k === "ArrowRight" || k === "ArrowDown" || (k === "j" && !e.shiftKey)) return { step: 1 };
  if (k === "ArrowLeft" || k === "ArrowUp" || (k === "k" && !e.shiftKey)) return { step: -1 };
  if (k === "Escape") return { leave: true };
  return null;
}
