// Settings writes: the one user_settings row and the work_hours rows.
import type { LocalDatabase } from "../powersync";

export interface SettingsPatch {
  timezone?: string;
  weekStart?: number;
  dayRolloverHour?: number;
  bufferPct?: number;
  defaultEstimateMin?: number;
  carryAskAfter?: number;
  autoSomedayDays?: number;
  /** The morning review of carried-over tasks on the first open of a new day. */
  carryReview?: boolean;
  eveningStartsAt?: string; // "18:00"
  theme?: "system" | "light" | "dark";
  // notifications (SYSTEM_DESIGN.md §7.1); a null time turns that nudge off
  notifyBlockStart?: boolean;
  notifyDeadline?: boolean;
  notifyMorning?: boolean;
  notifyShutdown?: boolean;
  morningNudgeTime?: string | null;
  shutdownNudgeTime?: string | null;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}

const COLUMNS: Record<keyof SettingsPatch, string> = {
  timezone: "timezone",
  weekStart: "week_start",
  dayRolloverHour: "day_rollover_hour",
  bufferPct: "buffer_pct",
  defaultEstimateMin: "default_estimate_min",
  carryAskAfter: "carry_ask_after",
  autoSomedayDays: "auto_someday_days",
  carryReview: "carry_review",
  eveningStartsAt: "evening_starts_at",
  theme: "theme",
  notifyBlockStart: "notify_block_start",
  notifyDeadline: "notify_deadline",
  notifyMorning: "notify_morning",
  notifyShutdown: "notify_shutdown",
  morningNudgeTime: "morning_nudge_time",
  shutdownNudgeTime: "shutdown_nudge_time",
  quietHoursStart: "quiet_hours_start",
  quietHoursEnd: "quiet_hours_end",
};

export class SettingsRepo {
  constructor(private readonly db: LocalDatabase) {}

  /** Writes only the keys present; booleans as 0/1, null clears. */
  async update(id: string, patch: SettingsPatch): Promise<void> {
    const keys = (Object.keys(patch) as (keyof SettingsPatch)[]).filter((k) => patch[k] !== undefined);
    if (keys.length === 0) return;
    const sets = keys.map((k) => `${COLUMNS[k]} = ?`).join(", ");
    const values = keys.map((k) => {
      const v = patch[k];
      return typeof v === "boolean" ? (v ? 1 : 0) : (v ?? null);
    });
    await this.db.execute(`update user_settings set ${sets}, updated_at = ? where id = ?`, [...values, new Date().toISOString(), id]);
  }
}

export class WorkHoursRepo {
  constructor(private readonly db: LocalDatabase) {}

  /** One segment per weekday for now: replaces the day's hours, or creates them. */
  async set(weekday: number, start: string, end: string, ctx: { spaceId: string; userId: string }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.writeTransaction(async (tx) => {
      const existing = await tx.getOptional<{ id: string }>(`select id from work_hours where deleted_at is null and weekday = ? order by start_time limit 1`, [weekday]);
      if (existing) {
        await tx.execute(`update work_hours set start_time = ?, end_time = ?, updated_at = ? where id = ?`, [start, end, now, existing.id]);
      } else {
        await tx.execute(`insert into work_hours (id, space_id, user_id, weekday, start_time, end_time, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)`, [
          crypto.randomUUID(),
          ctx.spaceId,
          ctx.userId,
          weekday,
          start,
          end,
          now,
          now,
        ]);
      }
    });
  }

  /** A non-working day. */
  async clear(weekday: number): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(`update work_hours set deleted_at = ?, updated_at = ? where deleted_at is null and weekday = ?`, [now, now, weekday]);
  }
}
