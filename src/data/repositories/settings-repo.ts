// Settings writes: the one user_settings row and the work_hours rows.
import type { MissPolicy } from "@/core/types";
import type { LocalDatabase } from "../powersync";

/** Where the app opens from `/` and the installed app's start URL (SCREENS.md §18 Planning "default view on open"). */
export type OpenTo = "today" | "inbox" | "upcoming";

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
  // notifications (SYSTEM_DESIGN.md §7.1); a null nudge time means "derived from working hours"
  notifyBlockStart?: boolean;
  notifyDeadline?: boolean;
  notifyMorning?: boolean;
  notifyShutdown?: boolean;
  morningNudgeTime?: string | null;
  shutdownNudgeTime?: string | null;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  /** Minutes before a block's start its reminder fires: 0, 5, 10 or 15. */
  blockStartLeadMin?: number;
  /** The app-icon badge (PRODUCT_SPEC.md §14 rule 6). */
  badgeEnabled?: boolean;
  // planning defaults (SCREENS.md §18 Planning)
  defaultMissPolicy?: MissPolicy;
  defaultView?: OpenTo;
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
  blockStartLeadMin: "block_start_lead_min",
  badgeEnabled: "badge_enabled",
  defaultMissPolicy: "default_miss_policy",
  defaultView: "default_view",
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
