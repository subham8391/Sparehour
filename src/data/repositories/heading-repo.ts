// Headings: section dividers inside a project. Deleting one moves its tasks
// up (heading cleared) in the same transaction — tasks are never deleted by
// a heading going away.
import { keyBetween } from "@/core/ordering";
import type { LocalDatabase } from "../powersync";

export class HeadingRepo {
  constructor(private readonly db: LocalDatabase) {}

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

  async rename(id: string, title: string): Promise<void> {
    await this.db.execute(`update headings set title = ?, updated_at = ? where id = ?`, [title.trim(), new Date().toISOString(), id]);
  }

  async remove(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.writeTransaction(async (tx) => {
      await tx.execute(`update tasks set heading_id = null, updated_at = ? where heading_id = ? and deleted_at is null`, [now, id]);
      await tx.execute(`update headings set deleted_at = ?, updated_at = ? where id = ?`, [now, now, id]);
    });
  }
}
