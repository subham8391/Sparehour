// Project writes. Like tasks: one local transaction per call, only the
// columns that change.
import { keyBetween } from "@/core/ordering";
import type { LocalDate } from "@/core/time";
import type { ProjectState } from "@/core/types";
import type { LocalDatabase } from "../powersync";

export class ProjectRepo {
  constructor(private readonly db: LocalDatabase) {}

  /** A new project at the end of its area's list (or of the loose list). */
  async create(name: string, ctx: { spaceId: string; areaId?: string | null }): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.writeTransaction(async (tx) => {
      const last = await tx.getOptional<{ sort_key: string | null }>(
        `select sort_key from projects where deleted_at is null and coalesce(area_id, '') = coalesce(?, '') order by sort_key desc limit 1`,
        [ctx.areaId ?? null],
      );
      await tx.execute(
        `insert into projects (id, space_id, area_id, name, state, sort_key, created_at, updated_at) values (?, ?, ?, ?, 'active', ?, ?, ?)`,
        [id, ctx.spaceId, ctx.areaId ?? null, name.trim(), keyBetween(last?.sort_key ?? null, null), now, now],
      );
    });
    return id;
  }

  async rename(id: string, name: string): Promise<void> {
    await this.db.execute(`update projects set name = ?, updated_at = ? where id = ?`, [name.trim(), new Date().toISOString(), id]);
  }

  async setNotes(id: string, notes: string | null): Promise<void> {
    await this.db.execute(`update projects set notes_md = ?, updated_at = ? where id = ?`, [notes?.trim() || null, new Date().toISOString(), id]);
  }

  async setDeadline(id: string, deadline: LocalDate | null): Promise<void> {
    await this.db.execute(`update projects set deadline = ?, updated_at = ? where id = ?`, [deadline?.toString() ?? null, new Date().toISOString(), id]);
  }

  /** Completing sets completed_at; going back to active clears it. */
  async setState(id: string, state: ProjectState): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(`update projects set state = ?, completed_at = case when ? = 'done' then ? else null end, updated_at = ? where id = ?`, [state, state, now, now, id]);
  }
}
