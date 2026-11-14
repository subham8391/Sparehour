// The export's older finished tasks (DECISIONS.md, amendment 2026-11-14). The device holds a week of finished
// tasks; the server keeps the rest in `finished_tasks`, one row each with the steps and tags folded in. For the
// export they are unfolded again into the tables the files are built from — a task row, its steps, its tag links,
// and for a repeat's finished day a completion of its task — so every format reads them as it reads the week the
// device has. Pure.
import type { ExportSnapshot, Row } from "@/core/export";
import { toTaskRow, type FinishedRow } from "@/features/finished/finished";

/** The snapshot with the older finished tasks added. A row already in the snapshot (it was reopened meanwhile) is left as it is. */
export function withFinished(snapshot: ExportSnapshot, finished: readonly FinishedRow[], newId: () => string = () => crypto.randomUUID()): ExportSnapshot {
  if (finished.length === 0) return snapshot;
  const tasks = [...snapshot.tasks];
  const steps = [...snapshot.checklist_items];
  const links = [...snapshot.task_tags];
  const completions = [...snapshot.task_completions];
  const haveTask = new Set(tasks.map((t) => t.id));
  const haveCompletion = new Set(completions.map((c) => c.id));
  for (const f of finished) {
    const stamps = { space_id: f.space_id, created_at: f.created_at, updated_at: f.updated_at, deleted_at: null };
    if (f.occurrence_of) {
      if (haveCompletion.has(f.id)) continue;
      completions.push({ id: f.id, ...stamps, task_id: f.occurrence_of, occurrence_date: f.occurrence_date, completed_at: f.completed_at, actual_min: f.actual_min });
      continue;
    }
    if (haveTask.has(f.id)) continue;
    tasks.push(toTaskRow(f) as unknown as Row);
    (f.checklist ?? []).forEach((step, i) => {
      steps.push({ id: newId(), ...stamps, task_id: f.id, title: step.title, done: step.done ? 1 : 0, sort_key: `a${String(i).padStart(4, "0")}` });
    });
    for (const tagId of f.tag_ids ?? []) links.push({ id: newId(), ...stamps, task_id: f.id, tag_id: tagId });
  }
  return { ...snapshot, tasks, checklist_items: steps, task_tags: links, task_completions: completions };
}
