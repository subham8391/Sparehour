// The write behind a quick-add line (PRODUCT_SPEC.md §5.1): the space it belongs to, the project it names (found, or
// made when the line asked for a new one), then the task itself through the task repository, which records its
// own undo. Its own module, free of the web's sheet and shell (quick-add-provider.tsx calls it in the browser), so
// the Android app saves a line by the same steps (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import type { LocalDatabase } from "@/data/powersync";
import type { TaskRepo } from "@/data/repositories/task-repo";
import type { QuickAddSubmission } from "./file-line";

export const SPACE_SQL = `select personal_space_id from users limit 1`;

export interface SaveWith {
  db: LocalDatabase;
  tasks: Pick<TaskRepo, "create">;
  /** The personal space as the screen already knows it; read again here when it is not known yet. */
  spaceId: string | null;
  /** Makes the project a line asked for by name; resolves its id. */
  makeProject: (db: LocalDatabase, name: string, spaceId: string) => Promise<string>;
}

/** Where on a page the task is put, beyond its project: a heading of the project it is filed in, or an area when it has no project. */
export interface SaveAt {
  headingId?: string | null;
  areaId?: string | null;
}

/** Saves one filed line; resolves the new task's id. Throws when the account's space is not on the device yet. */
export async function saveSubmission(w: SaveWith, s: QuickAddSubmission, at: SaveAt = {}): Promise<string> {
  // Right after the first sync the watch query can lag the data by a beat; read the row directly rather than fail.
  const sid = w.spaceId ?? (await w.db.getOptional<{ personal_space_id: string | null }>(SPACE_SQL))?.personal_space_id ?? null;
  if (!sid) throw new Error("Your account is still loading — try again in a moment.");
  let projectId = s.projectId;
  if (!projectId && s.createProjectName) {
    // Two quick lines can both name the same new project before the list catches up: the second one joins the first.
    const existing = await w.db.getOptional<{ id: string }>(`select id from projects where deleted_at is null and lower(name) = lower(?) limit 1`, [s.createProjectName]);
    projectId = existing?.id ?? (await w.makeProject(w.db, s.createProjectName, sid));
  }
  return w.tasks.create(s.draft, { spaceId: sid, projectId, ...at });
}
