// Headings: section dividers inside a project. Deleting one moves its tasks
// up (heading cleared) in the same transaction — tasks are never deleted by
// a heading going away — and its undo puts the heading back with its tasks
// under it again.
import { keyBetween } from "@/core/ordering";
import type { LocalDatabase } from "../powersync";
import { placeholders, quoted, restoreRow, type RowSnapshot, type UndoRecorder } from "./undo";

export class HeadingRepo {
  constructor(
    private readonly db: LocalDatabase,
    private readonly history?: UndoRecorder,
  ) {}

  async create(projectId: string, spaceId: string, title: string): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.writeTransaction(async (tx) => {
      const last = await tx.getOptional<{ sort_key: string | null }>(`select sort_key from headings where deleted_at is null and project_id = ? order by sort_key desc limit 1`, [
        projectId,
      ]);
      await tx.execute(`insert into headings (id, space_id, project_id, title, sort_key, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)`, [
        id,
        spaceId,
        projectId,
        title.trim(),
        keyBetween(last?.sort_key ?? null, null),
        now,
        now,
      ]);
    });
    return id;
  }

  /** A silent undo entry: ⌘Z puts the old title back. */
  async rename(id: string, title: string): Promise<void> {
    const before = this.history ? ((await this.db.getOptional<RowSnapshot>(`select * from headings where id = ?`, [id])) ?? null) : null;
    await this.db.execute(`update headings set title = ?, updated_at = ? where id = ?`, [title.trim(), new Date().toISOString(), id]);
    if (!this.history || !before) return;
    this.history.record({
      label: `Renamed heading ${quoted(before.title)}`,
      toast: false,
      undo: () => this.db.writeTransaction((tx) => restoreRow(tx, "headings", before, ["title"], new Date().toISOString())),
    });
  }

  /**
   * Soft-deletes the heading and moves its tasks up, in one transaction, with an undo toast. The undo brings
   * the heading back — re-inserted from its snapshot if sync has already taken it off the device — and files
   * the same tasks under it again, unless one has since been given another heading or another project.
   */
  async remove(id: string): Promise<void> {
    const now = new Date().toISOString();
    // Filled inside the transaction, so the snapshot and the delete see the same rows.
    let before = null as RowSnapshot | null;
    let taskIds: string[] = [];
    await this.db.writeTransaction(async (tx) => {
      if (this.history) {
        before = (await tx.getOptional<RowSnapshot>(`select * from headings where id = ?`, [id])) ?? null;
        taskIds = (await tx.getAll<{ id: string }>(`select id from tasks where heading_id = ? and deleted_at is null`, [id])).map((t) => t.id);
      }
      await tx.execute(`update tasks set heading_id = null, updated_at = ? where heading_id = ? and deleted_at is null`, [now, id]);
      await tx.execute(`update headings set deleted_at = ?, updated_at = ? where id = ?`, [now, now, id]);
    });
    const heading = before;
    if (!this.history || !heading) return;
    this.history.record({
      label: `Deleted heading ${quoted(heading.title)}`,
      toast: true,
      // One transaction: sync takes a deleted heading off the device a moment after it uploads, and that must
      // not land between restoreRow's presence check and its write.
      undo: () =>
        this.db.writeTransaction(async (tx) => {
          const at = new Date().toISOString();
          await restoreRow(tx, "headings", heading, ["deleted_at"], at);
          if (taskIds.length > 0) {
            await tx.execute(`update tasks set heading_id = ?, updated_at = ? where id in (${placeholders(taskIds)}) and heading_id is null and project_id = ?`, [
              id,
              at,
              ...taskIds,
              heading.project_id ?? null,
            ]);
          }
        }),
    });
  }
}
