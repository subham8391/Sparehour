// The day_plans row: one per (user, local date), created on first touch.
// Holds the ritual timestamps, the rating and the highlight (SCREENS.md
// §14–15).
import type { LocalDatabase } from "../powersync";

export interface DayPlanPatch {
  plannedAt?: string | null;
  shutdownAt?: string | null;
  /** When the morning review of carried-over tasks was answered or dismissed for the day. */
  carryReviewedAt?: string | null;
  highlights?: string | null;
  dayRating?: number | null;
}

const COLUMNS: Record<keyof DayPlanPatch, string> = {
  plannedAt: "planned_at",
  shutdownAt: "shutdown_at",
  carryReviewedAt: "carry_reviewed_at",
  highlights: "highlights",
  dayRating: "day_rating",
};

export class DayPlanRepo {
  constructor(private readonly db: LocalDatabase) {}

  /** Writes the keys present onto the day's row, creating the row if it does not exist. */
  async upsert(date: string, ctx: { spaceId: string; userId: string }, patch: DayPlanPatch): Promise<string> {
    const keys = (Object.keys(patch) as (keyof DayPlanPatch)[]).filter((k) => patch[k] !== undefined);
    const now = new Date().toISOString();
    let id = "";
    await this.db.writeTransaction(async (tx) => {
      const existing = await tx.getOptional<{ id: string }>(`select id from day_plans where deleted_at is null and user_id = ? and date = ? limit 1`, [ctx.userId, date]);
      if (existing) {
        id = existing.id;
        if (keys.length === 0) return;
        await tx.execute(`update day_plans set ${keys.map((k) => `${COLUMNS[k]} = ?`).join(", ")}, updated_at = ? where id = ?`, [...keys.map((k) => patch[k] as string | number | null), now, id]);
      } else {
        id = crypto.randomUUID();
        await tx.execute(
          `insert into day_plans (id, space_id, user_id, date, ${keys.map((k) => COLUMNS[k]).join(", ")}${keys.length ? ", " : ""}created_at, updated_at)
           values (?, ?, ?, ?, ${keys.map(() => "?").join(", ")}${keys.length ? ", " : ""}?, ?)`,
          [id, ctx.spaceId, ctx.userId, date, ...keys.map((k) => patch[k] as string | number | null), now, now],
        );
      }
    });
    return id;
  }
}
