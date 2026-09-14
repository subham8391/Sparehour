// Tags: matched by name (case-insensitive) or created; attached to a task
// through task_tags. Detaching soft-deletes the link, never the tag.
import type { LocalDatabase } from "../powersync";

export class TagRepo {
  constructor(private readonly db: LocalDatabase) {}

  /** Attaches the named tag to the task, creating the tag if it is new. Idempotent. */
  async attach(taskId: string, spaceId: string, name: string): Promise<void> {
    const clean = name.trim().replace(/^@/, "");
    if (!clean) return;
    const now = new Date().toISOString();
    await this.db.writeTransaction(async (tx) => {
      let tag = await tx.getOptional<{ id: string }>(`select id from tags where deleted_at is null and lower(name) = lower(?) limit 1`, [clean]);
      if (!tag) {
        tag = { id: crypto.randomUUID() };
        await tx.execute(`insert into tags (id, space_id, name, created_at, updated_at) values (?, ?, ?, ?, ?)`, [tag.id, spaceId, clean, now, now]);
      }
      const linked = await tx.getOptional<{ id: string }>(`select id from task_tags where deleted_at is null and task_id = ? and tag_id = ? limit 1`, [taskId, tag.id]);
      if (linked) return;
      await tx.execute(`insert into task_tags (id, space_id, task_id, tag_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)`, [crypto.randomUUID(), spaceId, taskId, tag.id, now, now]);
    });
  }

  async detach(taskId: string, tagId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(`update task_tags set deleted_at = ?, updated_at = ? where task_id = ? and tag_id = ? and deleted_at is null`, [now, now, taskId, tagId]);
  }
}
