import { describe, expect, it } from "vitest";
import { normaliseTimestamp, toCapacityEvent, toSettings, toTask, toWorkWindow } from "./index";

describe("normaliseTimestamp", () => {
  it("turns Postgres timestamptz text into ISO", () => {
    expect(normaliseTimestamp("2026-09-15 08:41:00+00")).toBe("2026-09-15T08:41:00+00:00");
    expect(normaliseTimestamp("2026-09-15T08:41:00.123+01:00")).toBe("2026-09-15T08:41:00.123+01:00");
    expect(normaliseTimestamp("2026-09-15 08:41:00")).toBe("2026-09-15T08:41:00Z");
    expect(normaliseTimestamp("2026-09-15T08:41:00Z")).toBe("2026-09-15T08:41:00Z");
  });
});

describe("row → domain", () => {
  it("maps a task row with calendar values and booleans", () => {
    const t = toTask({
      id: "t1", space_id: "s1", project_id: null, heading_id: null, area_id: null, assignee_id: null, title: "Write proposal", notes_md: null,
      state: "active", priority: 3, do_date: "2026-09-15", do_time: "09:45:00", deadline: "2026-09-18", start_date: null,
      evening: 0, estimate_min: 90, actual_min: null, carry_count: 2, last_carried_at: "2026-09-14",
      last_touched_at: "2026-09-13 10:00:00+00", miss_policy: "carry", recurrence_rule: null, recurrence_mode: null,
      recurrence_series_id: null, recurrence_paused_until: null, sort_key: "a0", day_sort_key: "a1", source: "quickadd",
      routine_run_id: null, routine_item_key: null, routine_item_id: null, routine_date: null, completed_at: null, expired_at: null, auto_filed_at: null,
      carry_asked_at: null, archive_batch_id: null, archived_from_state: null, archived_at: null, created_at: null, updated_at: null, deleted_at: null,
    });
    expect(t.doDate?.toString()).toBe("2026-09-15");
    expect(t.doTime?.toString({ smallestUnit: "minute" })).toBe("09:45");
    expect(t.deadline?.toString()).toBe("2026-09-18");
    expect(t.evening).toBe(false);
    expect(t.carryCount).toBe(2);
    expect(t.lastTouchedAt.toString()).toBe("2026-09-13T10:00:00Z");
    expect(t.priority).toBe(3);
  });

  it("maps work hours from Postgres weekdays (0 = Monday) to ISO (1 = Monday)", () => {
    const w = toWorkWindow({ id: "w", space_id: "s", user_id: "u", weekday: 0, start_time: "09:00:00", end_time: "18:00:00", created_at: null, updated_at: null, deleted_at: null });
    expect(w?.weekday).toBe(1);
    expect(w?.start.toString({ smallestUnit: "minute" })).toBe("09:00");
  });

  it("maps a calendar event, defaulting busy to true", () => {
    const e = toCapacityEvent(
      { id: "e", space_id: "s", user_id: "u", calendar_id: "c", external_id: "x", recurring_event_id: null, original_start_at: null, summary: "Standup",
        start_at: "2026-09-15 08:15:00+00", end_at: "2026-09-15 08:30:00+00", start_date: null, end_date: null, all_day: 0, busy: null,
        status: "confirmed", self_response: "accepted", event_type: "default", is_ours: 0, etag: null, created_at: null, updated_at: null, deleted_at: null },
      true,
    );
    expect(e.busy).toBe(true);
    expect(e.startAt?.toString()).toBe("2026-09-15T08:15:00Z");
    expect(e.calendarRead).toBe(true);
  });

  it("fills settings defaults", () => {
    const s = toSettings({ id: "x", user_id: "u", space_id: "s", timezone: null, week_start: null, day_rollover_hour: null, buffer_pct: null, default_estimate_min: null,
      max_block_min: null, min_block_min: null, carry_ask_after: null, auto_someday_days: null, morning_nudge_time: null, shutdown_nudge_time: null,
      quiet_hours_start: null, quiet_hours_end: null, notify_block_start: null, notify_deadline: null, notify_morning: null, notify_shutdown: null,
      theme: null, evening_starts_at: null, ai_enabled: null, carry_review: null, expired_seen_at: null, auto_filed_seen_at: null, default_miss_policy: null, default_view: null, block_start_lead_min: null, badge_enabled: null, today_sort: null, show_completed: null, created_at: null, updated_at: null });
    expect(s).toMatchObject({ timezone: "UTC", dayRolloverHour: 4, bufferPct: 15, defaultEstimateMin: 30, carryAskAfter: 3, autoSomedayDays: 30, carryReview: true });
    expect(s.eveningStartsAt.toString({ smallestUnit: "minute" })).toBe("18:00");
  });

  it("reads the morning review switch as a boolean, on until the column has synced", () => {
    const row = { id: "x", user_id: "u", space_id: "s", timezone: null, week_start: null, day_rollover_hour: null, buffer_pct: null, default_estimate_min: null,
      max_block_min: null, min_block_min: null, carry_ask_after: null, auto_someday_days: null, morning_nudge_time: null, shutdown_nudge_time: null,
      quiet_hours_start: null, quiet_hours_end: null, notify_block_start: null, notify_deadline: null, notify_morning: null, notify_shutdown: null,
      theme: null, evening_starts_at: null, ai_enabled: null, carry_review: null, expired_seen_at: null, auto_filed_seen_at: null, default_miss_policy: null, default_view: null, block_start_lead_min: null, badge_enabled: null, today_sort: null, show_completed: null, created_at: null, updated_at: null };
    expect(toSettings({ ...row, carry_review: 0 }).carryReview).toBe(false);
    expect(toSettings({ ...row, carry_review: 1 }).carryReview).toBe(true);
    expect(toSettings(row).carryReview).toBe(true);
  });

  it("reads Today's sort and Show completed, Manual and off until set", () => {
    const row = { id: "x", user_id: "u", space_id: "s", timezone: null, week_start: null, day_rollover_hour: null, buffer_pct: null, default_estimate_min: null,
      max_block_min: null, min_block_min: null, carry_ask_after: null, auto_someday_days: null, morning_nudge_time: null, shutdown_nudge_time: null,
      quiet_hours_start: null, quiet_hours_end: null, notify_block_start: null, notify_deadline: null, notify_morning: null, notify_shutdown: null,
      theme: null, evening_starts_at: null, ai_enabled: null, carry_review: null, expired_seen_at: null, auto_filed_seen_at: null, default_miss_policy: null, default_view: null, block_start_lead_min: null, badge_enabled: null, today_sort: null, show_completed: null, created_at: null, updated_at: null };
    expect(toSettings(row)).toMatchObject({ todaySort: "manual", showCompleted: false });
    expect(toSettings({ ...row, today_sort: "estimate", show_completed: 1 })).toMatchObject({ todaySort: "estimate", showCompleted: true });
    expect(toSettings({ ...row, today_sort: "nonsense" }).todaySort).toBe("manual");
  });

  it("reads when the three-carry ask was last shown", () => {
    const t = toTask({ id: "t1", carry_asked_at: "2026-10-05 09:00:00+00" } as Parameters<typeof toTask>[0]);
    expect(t.carryAskedAt?.toString()).toBe("2026-10-05T09:00:00Z");
    expect(toTask({ id: "t2" } as Parameters<typeof toTask>[0]).carryAskedAt).toBeNull();
  });
});
