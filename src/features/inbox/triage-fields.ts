// What triage gives a task without choosing its day (SCREENS.md §5): a project, an estimate, a deadline. The one
// write each makes, with its undo toast's words; each resolves true when the write filed the task (a project or a
// deadline takes it out of the Inbox, an estimate alone keeps it there: TaskRepo's rule, PRODUCT_SPEC.md §5.1 rule 5).
// Free of the pickers that ask (triage-sheet.tsx), so the Android app's pickers make the same writes
// (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import { formatMinutes, type LocalDate } from "@/core/time";
import type { TaskRepo } from "@/data/repositories/task-repo";

type Repo = Pick<TaskRepo, "update">;

/** The task a picker is open on: what it shows as chosen already. */
export const TRIAGE_TASK_SQL = `select id, title, estimate_min, deadline, project_id from tasks where id = ?`;

export interface TriageTaskRow {
  id: string;
  title: string | null;
  estimate_min: number | null;
  deadline: string | null;
  project_id: string | null;
}

/** Into a project, or out of the one it has ("No project": `id` null). */
export function fileInProject(repo: Repo, id: string, project: { id: string | null; name: string | null }): Promise<boolean> {
  const note = project.id ? `Moved {title} to ${project.name ?? "the project"}` : "Moved {title} out of its project";
  return repo.update(id, { projectId: project.id }, note).then(() => Boolean(project.id));
}

/** An estimate in minutes, or none. */
export function giveEstimate(repo: Repo, id: string, minutes: number | null): Promise<boolean> {
  return repo.update(id, { estimateMin: minutes }, minutes == null ? "Cleared the estimate on {title}" : `Estimated {title} at ${formatMinutes(minutes)}`).then(() => false);
}

/** A deadline, or none. */
export function giveDeadline(repo: Repo, id: string, deadline: LocalDate | null): Promise<boolean> {
  return repo.update(id, { deadline }, deadline ? "Set the deadline on {title}" : "Cleared the deadline on {title}").then(() => Boolean(deadline));
}
