// What completing a repeating task does (SYSTEM_DESIGN.md §5.2 "Completion"): the occurrence it closes, the day the
// row moves on to (none when the series has ended) and the deadline that travels with it at the same offset
// (DECISIONS.md, M1 gap rulings). Pure, so the app (data/repositories/recurring-completion.ts) and the MCP server's
// complete_task (src/server/mcp) roll a repeat forward the same way.
import { localDate, type LocalDate } from "../time";
import type { RecurrenceException, RecurrenceMode } from "../types";
import { deadlineForOccurrence, nextOccurrence } from "./index";
import { currentOccurrence } from "./series";

export interface RepeatingRow {
  do_date: string | null;
  deadline: string | null;
  recurrence_rule: string;
  recurrence_mode: string | null;
  recurrence_paused_until: string | null;
}

export interface ExceptionRowLike {
  occurrence_date: string;
  kind: string;
  moved_to: string | null;
}

export interface CompletionPlan {
  /** The scheduled day of the occurrence being closed (a moved one counts from where it was scheduled). */
  occurrence: LocalDate;
  /** The next occurrence, or null when the series ends here. */
  next: LocalDate | null;
  deadline: LocalDate | null;
}

export function toExceptions(rows: readonly ExceptionRowLike[]): RecurrenceException[] {
  return rows.map((e) =>
    e.kind === "move" && e.moved_to ? { occurrenceDate: localDate(e.occurrence_date), kind: "move", movedTo: localDate(e.moved_to) } : { occurrenceDate: localDate(e.occurrence_date), kind: "skip" },
  );
}

export function planCompletion(task: RepeatingRow, exceptions: readonly RecurrenceException[], today: LocalDate): CompletionPlan {
  const occurrence = currentOccurrence(task.do_date ? localDate(task.do_date) : null, today, exceptions);
  const next = nextOccurrence({
    rule: task.recurrence_rule,
    mode: (task.recurrence_mode === "after_completion" ? "after_completion" : "fixed") as RecurrenceMode,
    doDate: occurrence,
    completedOn: today,
    pausedUntil: task.recurrence_paused_until ? localDate(task.recurrence_paused_until) : null,
    exceptions,
  });
  const deadline = next ? deadlineForOccurrence(task.deadline ? localDate(task.deadline) : null, occurrence, next) : null;
  return { occurrence, next, deadline };
}
