// The client (SQLite) schema — the local mirror of the synced Postgres tables.
// Column types are PowerSync's three: text, integer, real. Booleans are 0/1,
// dates are ISO strings; src/data/mappers is the only place that converts.
import { column, Schema, Table } from "./powersync";

const base = {
  space_id: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
};

export const users = new Table({
  email: column.text,
  display_name: column.text,
  avatar_url: column.text,
  personal_space_id: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

export const spaces = new Table({
  kind: column.text,
  name: column.text,
  owner_id: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

export const space_members = new Table({
  ...base,
  user_id: column.text,
  role: column.text,
  invited_by: column.text,
  joined_at: column.text,
});

export const user_settings = new Table({
  user_id: column.text,
  space_id: column.text,
  timezone: column.text,
  week_start: column.integer,
  day_rollover_hour: column.integer,
  buffer_pct: column.integer,
  default_estimate_min: column.integer,
  max_block_min: column.integer,
  min_block_min: column.integer,
  carry_ask_after: column.integer,
  auto_someday_days: column.integer,
  morning_nudge_time: column.text,
  shutdown_nudge_time: column.text,
  quiet_hours_start: column.text,
  quiet_hours_end: column.text,
  notify_block_start: column.integer,
  notify_deadline: column.integer,
  notify_morning: column.integer,
  notify_shutdown: column.integer,
  theme: column.text,
  evening_starts_at: column.text,
  /** Settings › Working hours: This Evening's budget ends here ("22:00"; "00:00" is midnight). */
  evening_ends_at: column.text,
  ai_enabled: column.integer,
  carry_review: column.integer,
  /** The newest expired task Today's digest has announced; only later ones show. */
  expired_seen_at: column.text,
  /** The newest auto-filed batch Someday has announced; only later ones show. */
  auto_filed_seen_at: column.text,
  /** Settings › Planning: the miss policy a new one-off task starts with ('carry' | 'skip' | 'expire'). */
  default_miss_policy: column.text,
  /** Settings › Planning "Open to": 'today' | 'inbox' | 'upcoming'. */
  default_view: column.text,
  /** Minutes before a block's start its reminder fires: 0, 5, 10 or 15. */
  block_start_lead_min: column.integer,
  /** Settings › Notifications "Badge on the app icon". */
  badge_enabled: column.integer,
  /** Today's ⋯ Sort and Settings › Planning: 'manual' | 'time' | 'priority' | 'deadline' | 'estimate'. */
  today_sort: column.text,
  /** Today's ⋯ Show completed: today's finished tasks under a Done divider. */
  show_completed: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

export const work_hours = new Table(
  { ...base, user_id: column.text, weekday: column.integer, start_time: column.text, end_time: column.text },
  { indexes: { user: ["user_id"] } },
);

export const areas = new Table({ ...base, name: column.text, icon: column.text, color: column.text, sort_key: column.text });

export const projects = new Table(
  {
    ...base,
    area_id: column.text,
    name: column.text,
    notes_md: column.text,
    state: column.text,
    do_date: column.text,
    deadline: column.text,
    completed_at: column.text,
    sort_key: column.text,
  },
  { indexes: { area: ["area_id"], state: ["space_id", "state"] } },
);

export const headings = new Table({ ...base, project_id: column.text, title: column.text, sort_key: column.text }, { indexes: { project: ["project_id"] } });

export const tasks = new Table(
  {
    ...base,
    project_id: column.text,
    heading_id: column.text,
    /** Filed directly in an area (a loose task); never set together with project_id (migration 20261007124400). */
    area_id: column.text,
    assignee_id: column.text,
    title: column.text,
    notes_md: column.text,
    state: column.text,
    priority: column.integer,
    do_date: column.text,
    do_time: column.text,
    deadline: column.text,
    start_date: column.text,
    evening: column.integer,
    estimate_min: column.integer,
    actual_min: column.integer,
    carry_count: column.integer,
    last_carried_at: column.text,
    last_touched_at: column.text,
    miss_policy: column.text,
    recurrence_rule: column.text,
    recurrence_mode: column.text,
    recurrence_series_id: column.text,
    recurrence_paused_until: column.text,
    sort_key: column.text,
    day_sort_key: column.text,
    source: column.text,
    routine_run_id: column.text,
    routine_item_key: column.text,
    routine_item_id: column.text,
    routine_date: column.text,
    completed_at: column.text,
    /** Server-owned: when the rollover job dropped it under the expire policy (the Logbook's "Expired"). */
    expired_at: column.text,
    /** Server-owned: when the rollover job filed it to Someday untouched; cleared once a person touches it. */
    auto_filed_at: column.text,
    /** When the three-carry ask was last shown (once per task per 7 days, two a day); not a touch. */
    carry_asked_at: column.text,
    /** The archive batch it went into: Clear the slate, or a one-task batch when converted to a project. */
    archive_batch_id: column.text,
    /** The state it had before it was archived, for restoring its batch. */
    archived_from_state: column.text,
    /** When it went into its archive batch: names the batch in Settings › Data › Archive. */
    archived_at: column.text,
  },
  {
    indexes: {
      today: ["space_id", "do_date"],
      project: ["project_id"],
      area: ["area_id"],
      state: ["space_id", "state"],
      deadline: ["space_id", "deadline"],
    },
  },
);

export const checklist_items = new Table({ ...base, task_id: column.text, title: column.text, done: column.integer, sort_key: column.text }, { indexes: { task: ["task_id"] } });

export const tags = new Table({ ...base, name: column.text, color: column.text });

export const task_tags = new Table({ ...base, task_id: column.text, tag_id: column.text }, { indexes: { task: ["task_id"], tag: ["tag_id"] } });

export const task_completions = new Table(
  { ...base, task_id: column.text, occurrence_date: column.text, completed_at: column.text, actual_min: column.integer },
  { indexes: { task: ["task_id"] } },
);

export const recurrence_exceptions = new Table(
  { ...base, series_id: column.text, occurrence_date: column.text, kind: column.text, moved_to: column.text },
  { indexes: { series: ["series_id"] } },
);

export const calendars = new Table({
  ...base,
  user_id: column.text,
  calendar_account_id: column.text,
  external_id: column.text,
  summary: column.text,
  timezone: column.text,
  color: column.text,
  access_role: column.text,
  read: column.integer,
  private: column.integer,
  write_target: column.integer,
  sync_token: column.text,
  last_synced_at: column.text,
});

// What the server tells the client about each connected account (SYSTEM_DESIGN.md §6.2): read-only here.
export const calendar_connections = new Table({
  ...base,
  user_id: column.text,
  provider: column.text,
  email: column.text,
  status: column.text,
  can_write: column.integer,
  last_synced_at: column.text,
  last_error: column.text,
});

export const calendar_events = new Table(
  {
    ...base,
    user_id: column.text,
    calendar_id: column.text,
    external_id: column.text,
    recurring_event_id: column.text,
    original_start_at: column.text,
    summary: column.text,
    start_at: column.text,
    end_at: column.text,
    start_date: column.text,
    end_date: column.text,
    all_day: column.integer,
    busy: column.integer,
    status: column.text,
    self_response: column.text,
    event_type: column.text,
    is_ours: column.integer,
    etag: column.text,
  },
  { indexes: { window: ["user_id", "start_at"] } },
);

export const time_blocks = new Table(
  {
    ...base,
    user_id: column.text,
    task_id: column.text,
    title: column.text,
    start_at: column.text,
    end_at: column.text,
    locked: column.integer,
    source: column.text,
    routine_run_id: column.text,
    routine_item_key: column.text,
    routine_date: column.text,
    calendar_id: column.text,
    external_event_id: column.text,
    external_etag: column.text,
    push_state: column.text,
  },
  { indexes: { window: ["user_id", "start_at"], task: ["task_id"] } },
);

export const day_plans = new Table(
  {
    ...base,
    user_id: column.text,
    date: column.text,
    planned_at: column.text,
    shutdown_at: column.text,
    carry_reviewed_at: column.text,
    highlights: column.text,
    day_rating: column.integer,
    capacity_work_min: column.integer,
    capacity_busy_min: column.integer,
    capacity_buffer_min: column.integer,
    capacity_planned_min: column.integer,
    capacity_spare_min: column.integer,
  },
  { indexes: { date: ["user_id", "date"] } },
);

export const AppSchema = new Schema({
  users,
  spaces,
  space_members,
  user_settings,
  work_hours,
  areas,
  projects,
  headings,
  tasks,
  checklist_items,
  tags,
  task_tags,
  task_completions,
  recurrence_exceptions,
  calendars,
  calendar_connections,
  calendar_events,
  time_blocks,
  day_plans,
});

export type Database = (typeof AppSchema)["types"];
export type TaskRow = Database["tasks"];
export type TimeBlockRow = Database["time_blocks"];
export type CalendarEventRow = Database["calendar_events"];
export type CalendarConnectionRow = Database["calendar_connections"];
export type WorkHoursRow = Database["work_hours"];
export type UserSettingsRow = Database["user_settings"];
export type ProjectRow = Database["projects"];
export type HeadingRow = Database["headings"];
export type AreaRow = Database["areas"];
