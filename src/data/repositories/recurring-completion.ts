// Completing a repeating task (SYSTEM_DESIGN.md §5.2 "Completion"), loaded by
// TaskRepo the first time a repeat is completed, together with the recurrence
// engine (rrule), so neither is in an app shell's first download.
import { deadlineForOccurrence, nextOccurrence } from "@/core/recurrence";
import { currentOccurrence } from "@/core/recurrence/series";
import { localDate, type LocalDate } from "@/core/time";
import type { RecurrenceException, RecurrenceMode } from "@/core/types";
import type { LocalDatabase } from "../powersync";
import { placeholders, quoted, restoreRow, type UndoRecorder } from "./undo";

/** The recurrence fields of a row that repeats. */
export interface RecurringRow {
  id: string;
  space_id: string;
  do_date: string | null;
  deadline: string | null;
  recurrence_rule: string | null;
  recurrence_mode: string | null;
  recurrence_series_id: string | null;
  recurrence_paused_until: string | null;
  actual_min: number | null;
}

/**
 * A recurring task is one row that rolls forward. Completing it writes a completion for the scheduled
 * occurrence and moves the row to the next one (or marks it done when the series ends); the checklist
 * resets, the deadline moves with the occurrence at the same offset (DECISIONS.md 2026-10-06), and the carry
 * count starts again at 0 — the server does the same when the completion lands, since carry_count is
 * server-owned. Undo soft-deletes the completion, which puts the server's count back, restores the row and ticks its steps again.
 */
export async function completeRecurring(
  db: LocalDatabase,
  history: UndoRecorder | undefined,
  task: RecurringRow,
  before: Record<string, string | number | null> & { id: string },
  today: LocalDate,
): Promise<void> {
  const rows = await db.getAll<{ occurrence_date: string; kind: string; moved_to: string | null }>(
    `select occurrence_date, kind, moved_to from recurrence_exceptions where deleted_at is null and series_id = ?`,
    [task.recurrence_series_id ?? task.id],
  );
  const exceptions: RecurrenceException[] = (Array.isArray(rows) ? rows : []).map((e) =>
    e.kind === "move" && e.moved_to ? { occurrenceDate: localDate(e.occurrence_date), kind: "move", movedTo: localDate(e.moved_to) } : { occurrenceDate: localDate(e.occurrence_date), kind: "skip" },
  );
  // A task moved "just this once" is still the occurrence it was scheduled as: the completion is recorded
  // against that day and the series counts on from it, back on its rule (SYSTEM_DESIGN.md §5.2 "Series edits").
  const occurrence = currentOccurrence(task.do_date ? localDate(task.do_date) : null, today, exceptions);
  const next = nextOccurrence({
    rule: task.recurrence_rule as string,
    mode: task.recurrence_mode as RecurrenceMode,
    doDate: occurrence,
    completedOn: today,
    pausedUntil: task.recurrence_paused_until ? localDate(task.recurrence_paused_until) : null,
    exceptions,
  });
  const deadline = next ? deadlineForOccurrence(task.deadline ? localDate(task.deadline) : null, occurrence, next) : null;
  const cols = ["do_date", "deadline", "state", "completed_at", "carry_count", "last_carried_at"];
  const now = new Date().toISOString();
  const completionId = crypto.randomUUID();
  // The steps the reset unticks, so the undo can tick them again.
  let ticked: string[] = [];
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `insert into task_completions (id, space_id, task_id, occurrence_date, completed_at, actual_min, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [completionId, task.space_id, task.id, occurrence.toString(), now, task.actual_min ?? null, now, now],
    );
    if (next) {
      await tx.execute(`update tasks set do_date = ?, deadline = ?, state = 'active', completed_at = null, carry_count = 0, last_carried_at = null, updated_at = ? where id = ?`, [
        next.toString(),
        deadline?.toString() ?? null,
        now,
        task.id,
      ]);
      const steps = await tx.getAll<{ id: string }>(`select id from checklist_items where task_id = ? and done = 1 and deleted_at is null`, [task.id]);
      ticked = Array.isArray(steps) ? steps.map((r) => r.id) : [];
      await tx.execute(`update checklist_items set done = 0, updated_at = ? where task_id = ? and done = 1 and deleted_at is null`, [now, task.id]);
    } else {
      await tx.execute(`update tasks set state = 'done', completed_at = ?, updated_at = ? where id = ?`, [now, now, task.id]);
    }
  });
  if (!history) return;
  history.record({
    label: `Completed ${quoted(before.title)}`,
    toast: true,
    rows: { tasks: [task.id], task_completions: [completionId], checklist_items: ticked },
    // One transaction: sync takes a done row off the device a moment after it uploads (see restoreRow).
    undo: () =>
      db.writeTransaction(async (tx) => {
        const at = new Date().toISOString();
        await tx.execute(`update task_completions set deleted_at = ?, updated_at = ? where id = ?`, [at, at, completionId]);
        await restoreRow(tx, "tasks", { ...before, id: task.id }, cols, at);
        if (ticked.length > 0) await tx.execute(`update checklist_items set done = 1, updated_at = ? where id in (${placeholders(ticked)}) and done = 0`, [at, ...ticked]);
      }),
  });
}
