// Settings writes: the one user_settings row (user-settings-repo.ts) and the work_hours rows.
import type { LocalDatabase } from "../powersync";

export { SettingsRepo, type OpenTo, type SettingsPatch } from "./user-settings-repo";

/** One stretch of a working day, "HH:MM" to "HH:MM". */
export interface WorkSegment {
  start: string;
  end: string;
}

export class WorkHoursRepo {
  constructor(private readonly db: LocalDatabase) {}

  /**
   * Makes a weekday's working hours exactly `segments` (PRODUCT_SPEC.md §9.5: several per day), in one transaction:
   * the day's rows are reused in start order and updated where they differ, extra ones are removed by id, missing
   * ones are inserted. An empty list is a day off. Undo is the same call with the day's previous segments.
   */
  async replaceDay(weekday: number, segments: readonly WorkSegment[], ctx: { spaceId: string; userId: string }): Promise<void> {
    const now = new Date().toISOString();
    const wanted = [...segments].sort((a, b) => a.start.localeCompare(b.start));
    await this.db.writeTransaction(async (tx) => {
      const existing = await tx.getAll<{ id: string; start_time: string | null; end_time: string | null }>(
        `select id, start_time, end_time from work_hours where deleted_at is null and weekday = ? order by start_time, id`,
        [weekday],
      );
      for (let i = 0; i < Math.max(existing.length, wanted.length); i++) {
        const row = existing[i];
        const seg = wanted[i];
        if (row && seg) {
          if ((row.start_time ?? "").slice(0, 5) !== seg.start || (row.end_time ?? "").slice(0, 5) !== seg.end)
            await tx.execute(`update work_hours set start_time = ?, end_time = ?, updated_at = ? where id = ?`, [seg.start, seg.end, now, row.id]);
        } else if (row) {
          await tx.execute(`update work_hours set deleted_at = ?, updated_at = ? where id = ?`, [now, now, row.id]);
        } else if (seg) {
          await tx.execute(`insert into work_hours (id, space_id, user_id, weekday, start_time, end_time, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)`, [
            crypto.randomUUID(),
            ctx.spaceId,
            ctx.userId,
            weekday,
            seg.start,
            seg.end,
            now,
            now,
          ]);
        }
      }
    });
  }
}
