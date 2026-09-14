// Checklist writes: one level, ordered by fractional keys, each call one
// local transaction.
import { keyBetween } from "@/core/ordering";
import type { LocalDatabase } from "../powersync";

export class ChecklistRepo {
  constructor(private readonly db: LocalDatabase) {}

  /** Appends a step at the end of the task's checklist. */
  async add(taskId: string, spaceId: string, title: string): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.writeTransaction(async (tx) => {
      const last = await tx.getOptional<{ sort_key: string | null }>(
        `select sort_key from checklist_items where deleted_at is null and task_id = ? order by sort_key desc limit 1`,
        [taskId],
      );
      await tx.execute(`insert into checklist_items (id, space_id, task_id, title, done, sort_key, created_at, updated_at) values (?, ?, ?, ?, 0, ?, ?, ?)`, [
        id,
        spaceId,
        taskId,
        title.trim(),
        keyBetween(last?.sort_key ?? null, null),
        now,
        now,
      ]);
    });
    return id;
  }

  async setDone(id: string, done: boolean): Promise<void> {
    await this.db.execute(`update checklist_items set done = ?, updated_at = ? where id = ?`, [done ? 1 : 0, new Date().toISOString(), id]);
  }

  async rename(id: string, title: string): Promise<void> {
    await this.db.execute(`update checklist_items set title = ?, updated_at = ? where id = ?`, [title.trim(), new Date().toISOString(), id]);
  }

  async remove(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(`update checklist_items set deleted_at = ?, updated_at = ? where id = ?`, [now, now, id]);
  }
}
