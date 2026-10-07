// Convert task → project (PRODUCT_SPEC.md §6; "Break it down" in the
// three-carry ask, §8.3.3). Loaded on the click that asks for it, never with
// a shell (SYSTEM_DESIGN.md §11.6).
//
// The ruling (DECISIONS.md, M1 gap rulings 2026-10-06): the project takes the
// task's title as its name, its note, its deadline and the area of the task's
// project (or the task's own, for a loose task in an area); unticked steps become open, undated tasks in step order and ticked
// ones done tasks; the task itself is retired by archiving it in a one-task
// batch of its own (so Settings › Data › Archive can bring it back once the
// toast has gone), keeping its tags, dates, estimate, priority and checklist.
// The carry count resets on the server: tasks_guard zeroes it when a person
// archives a task, and the client never writes it. One transaction, one undo.
import { keyBetween } from "@/core/ordering";
import { Temporal } from "@/core/time";
import { normaliseTimestamp } from "../mappers";
import type { LocalDatabase } from "../powersync";
import { reviveBlocks, type BlockRow } from "./block-repo";
import { placeholders, quoted, restoreRow, type RowSnapshot, type Tx, type UndoRecorder } from "./undo";

/** The columns the retirement writes on the task, and the undo puts back. */
const RETIRED = ["state", "archive_batch_id", "archived_from_state", "archived_at"] as const;
const OPEN_STATES = new Set(["inbox", "active", "someday"]);
/** The steps' tasks are made in the app, so their source is the app's own (the server checks it against a closed list). */
export const CONVERTED_SOURCE = "quickadd";

export interface Converted {
  projectId: string;
  /** The new tasks, in step order. */
  taskIds: string[];
}

/** Whether a task in this state can be converted: an open or parked one, not one already done or retired. */
export const canConvert = (state: string | null | undefined): boolean => OPEN_STATES.has(state ?? "");

/**
 * Converts the task into a project in one local transaction and records one undo entry that removes the project
 * and its new tasks and brings the task back as it was. Resolves null when the task is not here or cannot be
 * converted (done, dropped, already archived).
 */
export async function convertTaskToProject(
  db: LocalDatabase,
  history: UndoRecorder | undefined,
  taskId: string,
  /** Runs once the undo has put the task back, so a screen showing the removed project can step back from it. */
  onUndone?: (projectId: string) => void,
): Promise<Converted | null> {
  const now = new Date().toISOString();
  const result = await db.writeTransaction(async (tx) => {
    const before = await tx.getOptional<RowSnapshot>(`select * from tasks where id = ? and deleted_at is null`, [taskId]);
    if (!before || !canConvert(text(before.state))) return null;
    const spaceId = text(before.space_id) ?? "";
    const area = before.project_id ? await tx.getOptional<{ area_id: string | null }>(`select area_id from projects where id = ?`, [before.project_id]) : null;
    // A loose task names its own area (tasks.area_id); a project task's area is its project's.
    const areaId = text(before.area_id) ?? area?.area_id ?? null;

    const projectId = crypto.randomUUID();
    const lastProject = await tx.getOptional<{ sort_key: string | null }>(
      `select sort_key from projects where deleted_at is null and coalesce(area_id, '') = coalesce(?, '') order by sort_key desc limit 1`,
      [areaId],
    );
    await tx.execute(
      `insert into projects (id, space_id, area_id, name, notes_md, state, deadline, sort_key, created_at, updated_at) values (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      [projectId, spaceId, areaId, String(before.title ?? "").trim() || "Untitled project", text(before.notes_md), text(before.deadline), keyBetween(lastProject?.sort_key ?? null, null), now, now],
    );

    // Steps become tasks in their order: unticked ones open and undated, ticked ones already done — finished when the
    // step was last changed, not now, so an old tick does not land in today's Done list or the shutdown's count.
    const steps = await tx.getAll<{ title: string | null; done: number | null; updated_at: string | null }>(
      `select title, done, updated_at from checklist_items where task_id = ? and deleted_at is null order by sort_key, id`,
      [taskId],
    );
    const defaults = await tx.getOptional<{ default_miss_policy: string | null }>(`select default_miss_policy from user_settings limit 1`);
    const missPolicy = defaults?.default_miss_policy === "skip" || defaults?.default_miss_policy === "expire" ? defaults.default_miss_policy : "carry";
    const taskIds: string[] = [];
    let key: string | null = null;
    for (const step of steps) {
      const title = (step.title ?? "").trim();
      if (!title) continue;
      const id = crypto.randomUUID();
      key = keyBetween(key, null);
      const done = step.done === 1;
      // `source` is the server's closed list (tasks_source_check): a task a person makes in the app is 'quickadd'.
      // Any other word is refused at upload, and the steps would vanish at the next sync.
      await tx.execute(
        `insert into tasks (id, space_id, project_id, title, state, priority, evening, carry_count, last_touched_at, miss_policy, sort_key, source, completed_at, created_at, updated_at)
         values (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, '${CONVERTED_SOURCE}', ?, ?, ?)`,
        [id, spaceId, projectId, title, done ? "done" : "active", now, missPolicy, key, done ? tickedAt(step.updated_at, now) : null, now, now],
      );
      taskIds.push(id);
    }

    // Retire the task: archived in a batch of its own, everything else left on it.
    await tx.execute(`update tasks set state = 'archived', archive_batch_id = ?, archived_from_state = ?, archived_at = ?, updated_at = ? where id = ?`, [crypto.randomUUID(), text(before.state), now, now, taskId]);
    const released = await releaseFutureBlocks(tx, [taskId], now);
    return { before, projectId, taskIds, released };
  });
  if (!result) return null;

  const { before, projectId, taskIds, released } = result;
  history?.record({
    label: `Converted ${quoted(before.title)} to a project`,
    toast: true,
    rows: { tasks: [taskId, ...taskIds], projects: [projectId], time_blocks: released.map((b) => b.id) },
    undo: async () => {
      await db.writeTransaction(async (tx) => {
        const at = new Date().toISOString();
        if (taskIds.length > 0) await tx.execute(`update tasks set deleted_at = ?, updated_at = ? where id in (${placeholders(taskIds)})`, [at, at, ...taskIds]);
        // Anything the person added to the new project before undoing is theirs: it leaves the project, never with it.
        const kept = taskIds.length > 0 ? `and id not in (${placeholders(taskIds)})` : "";
        await tx.execute(`update tasks set project_id = null, heading_id = null, updated_at = ? where project_id = ? and deleted_at is null ${kept}`, [at, projectId, ...taskIds]);
        await tx.execute(`update projects set deleted_at = ?, updated_at = ? where id = ?`, [at, at, projectId]);
        await restoreRow(tx, "tasks", before, RETIRED, at);
        if (released.length > 0) await reviveBlocks(tx, released, at);
      });
      onUndone?.(projectId);
    },
  });
  return { projectId, taskIds };
}

/**
 * A retired task lets go of the time it held, as Someday and Drop do (TaskRepo.releaseBlocks): its unlocked blocks
 * that have not started are soft-deleted, and returned so the undo can bring them back.
 */
export async function releaseFutureBlocks(tx: Pick<Tx, "execute" | "getAll">, taskIds: readonly string[], at: string): Promise<BlockRow[]> {
  if (taskIds.length === 0) return [];
  const rows = await tx.getAll<BlockRow>(`select * from time_blocks where task_id in (${placeholders(taskIds)}) and deleted_at is null and locked = 0`, [...taskIds]);
  const now = Temporal.Now.instant();
  const release = (Array.isArray(rows) ? rows : []).filter((b) => {
    if (typeof b.start_at !== "string") return false;
    try {
      return Temporal.Instant.compare(Temporal.Instant.from(normaliseTimestamp(b.start_at)), now) > 0;
    } catch {
      return false;
    }
  });
  if (release.length === 0) return [];
  await tx.execute(`update time_blocks set deleted_at = ?, updated_at = ? where id in (${placeholders(release.map((b) => b.id))})`, [at, at, ...release.map((b) => b.id)]);
  return release;
}

const text = (v: string | number | null | undefined): string | null => (v == null ? null : String(v));

/** When a ticked step was finished, as near as the row knows: its last change, else now. Never later than now. */
function tickedAt(updatedAt: string | null, now: string): string {
  if (!updatedAt) return now;
  try {
    const at = Temporal.Instant.from(normaliseTimestamp(updatedAt));
    return Temporal.Instant.compare(at, Temporal.Instant.from(now)) < 0 ? at.toString() : now;
  } catch {
    return now;
  }
}
