// The one user_settings row's writes. Kept apart from the work-hours writes in settings-repo.ts (which re-exports
// this) so the shell, which saves the theme and Today's view preferences, carries only this (SYSTEM_DESIGN.md §11.6).
import type { TodaySort } from "@/core/today/sort-options";
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
  /** The evening cut-off, "22:00" (This Evening's budget). */
  eveningEndsAt?: string;
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
  /** Today's ⋯ Sort and its default (a view preference over the Today and This evening sections). */
  todaySort?: TodaySort;
  /** Today's ⋯ Show completed. */
  showCompleted?: boolean;
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
  eveningEndsAt: "evening_ends_at",
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
  todaySort: "today_sort",
  showCompleted: "show_completed",
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

  /**
   * The first run is over, finished or skipped (ONBOARDING.md 1b and step 3): the shell stops sending the person
   * to /welcome. Once only; there is nothing to undo back into.
   */
  async finishFirstRun(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(`update user_settings set onboarded_at = ?, updated_at = ? where id = ? and onboarded_at is null`, [now, now, id]);
  }
}
