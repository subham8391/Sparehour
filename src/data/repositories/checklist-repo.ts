// Checklist writes: one level, ordered by fractional keys, each call one
// local transaction. Every edit leaves an undo entry: silent for adding,
// ticking and renaming a step, a toast for deleting one.
import { keyBetween } from "@/core/ordering";
import type { LocalDatabase } from "../powersync";
import { quoted, restoreRow, type RowSnapshot, type UndoRecorder } from "./undo";

export class ChecklistRepo {
  constructor(
    private readonly db: LocalDatabase,
    private readonly history?: UndoRecorder,
  ) {}

  /** Adds a step: at `sortKey` when given (Enter on a step puts the next one right under it), else at the end. */
  async add(taskId: string, spaceId: string, title: string, sortKey?: string): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const clean = title.trim();
    await this.db.writeTransaction(async (tx) => {
      const last = sortKey
        ? null
        : await tx.getOptional<{ sort_key: string | null }>(`select sort_key from checklist_items where deleted_at is null and task_id = ? order by sort_key desc limit 1`, [taskId]);
      await tx.execute(`insert into checklist_items (id, space_id, task_id, title, done, sort_key, created_at, updated_at) values (?, ?, ?, ?, 0, ?, ?, ?)`, [
        id,
        spaceId,
        taskId,
        clean,
        sortKey ?? keyBetween(last?.sort_key ?? null, null),
        now,
        now,
      ]);
    });
    this.history?.record({
      label: `Added step ${quoted(clean)}`,
      toast: false,
      undo: async () => {
        const at = new Date().toISOString();
        await this.db.execute(`update checklist_items set deleted_at = ?, updated_at = ? where id = ?`, [at, at, id]);
      },
    });
    return id;
  }

  async setDone(id: string, done: boolean): Promise<void> {
    const before = await this.snapshot(id);
    await this.db.execute(`update checklist_items set done = ?, updated_at = ? where id = ?`, [done ? 1 : 0, new Date().toISOString(), id]);
    this.remember(before, ["done"], done ? "Ticked" : "Unticked", false);
  }

  async rename(id: string, title: string): Promise<void> {
    const before = await this.snapshot(id);
    await this.db.execute(`update checklist_items set title = ?, updated_at = ? where id = ?`, [title.trim(), new Date().toISOString(), id]);
    this.remember(before, ["title"], "Renamed step", false);
  }

  /** A new place in the list (a drag, Move up / Move down, Alt+↑/↓): one key written, a silent undo entry. */
  async reorder(id: string, sortKey: string): Promise<void> {
    const before = await this.snapshot(id);
    await this.db.execute(`update checklist_items set sort_key = ?, updated_at = ? where id = ?`, [sortKey, new Date().toISOString(), id]);
    this.remember(before, ["sort_key"], "Moved step", false);
  }

  /** Soft-deletes the step, with an undo toast that brings it back where it was. */
  async remove(id: string): Promise<void> {
    const before = await this.snapshot(id);
    const now = new Date().toISOString();
    await this.db.execute(`update checklist_items set deleted_at = ?, updated_at = ? where id = ?`, [now, now, id]);
    this.remember(before, ["deleted_at"], "Deleted step", true);
  }

  // ---- undo: the whole row is the snapshot, so a deleted step can be re-inserted once sync has taken it away

  private async snapshot(id: string): Promise<RowSnapshot | null> {
    if (!this.history) return null;
    return (await this.db.getOptional<RowSnapshot>(`select * from checklist_items where id = ?`, [id])) ?? null;
  }

  private remember(before: RowSnapshot | null, columns: readonly string[], verb: string, toast: boolean): void {
    if (!this.history || !before) return;
    this.history.record({
      label: `${verb} ${quoted(before.title)}`,
      toast,
      undo: () => this.db.writeTransaction((tx) => restoreRow(tx, "checklist_items", before, columns, new Date().toISOString())),
    });
  }
}
