// The one user_settings row as Settings shows it (SCREENS.md §18): each column with the default it has when the row
// says nothing, the form's shape of a patch and the way back, and whether the row has caught up with what was just
// written. Free of the web's screen parts, so the web's page (app/(app)/settings/page.tsx) and the Android app's
// Settings read the row the same way (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import { isTodaySort, type TodaySort } from "@/core/today/sort-options";
import type { MissPolicy } from "@/core/types";
import type { OpenTo, SettingsPatch } from "@/data/repositories/settings-repo";
import type { UserSettingsRow } from "@/data/schema.client";
import { DEFAULT_LOOK, isLookId } from "@/features/looks/look";

/** Reduce motion on this device: System (the default, the OS decides) or Reduce (motion.ts keeps and applies it). */
export type MotionChoice = "system" | "reduce";

export interface SettingsValues {
  timezone: string;
  weekStart: number;
  dayRolloverHour: number;
  bufferPct: number;
  defaultEstimateMin: number;
  carryAskAfter: number;
  autoSomedayDays: number;
  /** The morning review of carried-over tasks on the first open of a new day. */
  carryReview: boolean;
  eveningStartsAt: string;
  eveningEndsAt: string;
  theme: "system" | "light" | "dark";
  /** The look's id (features/looks/catalog.ts). */
  look: string;
  notifyBlockStart: boolean;
  notifyDeadline: boolean;
  notifyMorning: boolean;
  notifyShutdown: boolean;
  /** "HH:MM" when a time was chosen; empty for the time derived from working hours. */
  morningNudgeTime: string;
  shutdownNudgeTime: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  /** Minutes before a block's start its reminder fires: 0, 5, 10 or 15. */
  blockStartLeadMin: number;
  badgeEnabled: boolean;
  defaultMissPolicy: MissPolicy;
  defaultView: OpenTo;
  /** Today's sort, as its ⋯ menu sets it (SCREENS.md §18 Planning "sort defaults"). */
  todaySort: TodaySort;
  /** Today's Show completed. */
  showCompleted: boolean;
}

/** What the undo history calls a changed setting, and a changed day of working hours (silent entries: the inline Saved confirms them). */
export const SETTING_CHANGED = "Changed a setting";
export const HOURS_CHANGED = "Changed working hours";

/** Who is signed in, for Settings › Account and the writes that need the person's space. */
export const USER_SQL = `select id, email, display_name, avatar_url, personal_space_id from users limit 1`;

const MISS_POLICIES: readonly MissPolicy[] = ["carry", "skip", "expire"];
const OPEN_TO: readonly OpenTo[] = ["today", "inbox", "upcoming"];
const LEADS = [0, 5, 10, 15];

/** The settings row as the form's values; a column the row leaves empty, or holds something unknown in, reads as its default. */
export function settingsValues(s: UserSettingsRow): SettingsValues {
  return {
    timezone: s.timezone ?? "UTC",
    weekStart: s.week_start ?? 0,
    dayRolloverHour: s.day_rollover_hour ?? 4,
    bufferPct: s.buffer_pct ?? 15,
    defaultEstimateMin: s.default_estimate_min ?? 30,
    carryAskAfter: s.carry_ask_after ?? 3,
    autoSomedayDays: s.auto_someday_days ?? 30,
    carryReview: (s.carry_review ?? 1) === 1,
    eveningStartsAt: (s.evening_starts_at ?? "18:00").slice(0, 5),
    eveningEndsAt: (s.evening_ends_at ?? "22:00").slice(0, 5),
    theme: (s.theme === "light" || s.theme === "dark" ? s.theme : "system") as SettingsValues["theme"],
    look: isLookId(s.look) ? s.look : DEFAULT_LOOK,
    notifyBlockStart: (s.notify_block_start ?? 1) === 1,
    notifyDeadline: (s.notify_deadline ?? 1) === 1,
    notifyMorning: (s.notify_morning ?? 1) === 1,
    notifyShutdown: (s.notify_shutdown ?? 0) === 1,
    morningNudgeTime: (s.morning_nudge_time ?? "").slice(0, 5),
    shutdownNudgeTime: (s.shutdown_nudge_time ?? "").slice(0, 5),
    quietHoursStart: (s.quiet_hours_start ?? "").slice(0, 5),
    quietHoursEnd: (s.quiet_hours_end ?? "").slice(0, 5),
    blockStartLeadMin: LEADS.includes(s.block_start_lead_min ?? 0) ? (s.block_start_lead_min ?? 0) : 0,
    badgeEnabled: (s.badge_enabled ?? 1) === 1,
    defaultMissPolicy: MISS_POLICIES.includes(s.default_miss_policy as MissPolicy) ? (s.default_miss_policy as MissPolicy) : "carry",
    defaultView: OPEN_TO.includes(s.default_view as OpenTo) ? (s.default_view as OpenTo) : "today",
    todaySort: isTodaySort(s.today_sort) ? s.today_sort : "manual",
    showCompleted: s.show_completed === 1,
  };
}

/** The form's shape of a patch: a cleared nudge time is "" there, null in the row. */
export function asValues(patch: SettingsPatch): Partial<SettingsValues> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) out[k] = v ?? "";
  return out as Partial<SettingsValues>;
}

/** What the given keys were, as a patch that writes them back. */
export function asPatch(values: SettingsValues, keys: readonly (keyof SettingsPatch)[]): SettingsPatch {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = values[k as keyof SettingsValues];
    out[k] = v === "" ? null : v;
  }
  return out as SettingsPatch;
}

/**
 * Whether the row says everything that was just written. Writes are local and land at once, but the query that
 * redraws the controls can trail them by a second while an upload holds the write lock: a choice shows straight away
 * and stays until the row says the same.
 */
export function caughtUp(saved: SettingsValues, pending: SettingsPatch): boolean {
  const keys = Object.keys(pending) as (keyof SettingsPatch)[];
  return keys.every((k) => (saved[k] ?? "") === (pending[k] ?? ""));
}
