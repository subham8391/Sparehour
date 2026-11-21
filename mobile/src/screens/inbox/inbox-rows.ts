// The Inbox's rows as the phone lists them: each task with the quiet line under its title, its project (when it has
// one) and its age, "Acme · added 2d". The age is the web's own wording (../../../../src/features/inbox/age.ts);
// nothing is worked out here. Its own file, free of the screen, so it is tested plainly.
import type { LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { toTask } from "@/data/mappers";
import type { TaskRow } from "@/data/schema.client";
import { addedLabel } from "@/features/inbox/age";

export interface InboxRow {
  task: Task;
  /** "Acme · added 2d"; empty when the row has neither. */
  detail: string;
}

/** The rows in the order they were read (the query's: newest capture first). */
export function inboxRows(rows: readonly TaskRow[], projectNames: ReadonlyMap<string, string>, today: LocalDate, zone: string): InboxRow[] {
  return rows.map((row) => {
    const task = toTask(row);
    const project = task.projectId ? projectNames.get(task.projectId) : undefined;
    const age = addedLabel(row.created_at, today, zone);
    return { task, detail: [project, age].filter(Boolean).join(" · ") };
  });
}
