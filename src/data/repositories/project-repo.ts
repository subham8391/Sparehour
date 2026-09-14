// Project writes. Like tasks: one local transaction per call, only the
// columns that change.
import { keyBetween } from "@/core/ordering";
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
}
