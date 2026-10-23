// What the MCP tools read and write, as one narrow interface (DECISIONS.md, amendment 2026-10-23). The real store
// talks to PostgREST with the caller's own access token, so every read is filtered by RLS and every write goes
// through apply_mutations as that person — the guards, the server-owned columns and the read-only connection rule
// (migration 20261023000100) all hold, and the rows reach their devices through the PowerSync streams like any
// upload. Rows come back in the shape the app's mappers read (booleans as 0/1, as SQLite has them), so the server
// reads a task exactly as Today does. Tests swap in an in-memory store (store.fake.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WireOp } from "@/server/sync/upload";

export type TaskState = "inbox" | "active" | "someday" | "done" | "dropped" | "archived";

/** A row as PostgREST returns it, booleans already turned into SQLite's 0/1. */
export type Row = Record<string, string | number | null>;

export interface Profile {
  userId: string;
  spaceId: string;
  /** The person's user_settings row (null before it exists). */
  settings: Row | null;
}

export interface TaskQuery {
  states: readonly TaskState[];
  /** do_date on or before (ISO date). */
  doDateLte?: string;
  /** do_date after (ISO date). */
  doDateGt?: string;
  /** do_date is null. */
  undated?: boolean;
  /** start_date is null or on or before (ISO date): the task has started. */
  startedBy?: string;
  /** start_date after (ISO date): hidden until then. */
  startsAfter?: string;
  /** Title or note contains this (case-insensitive). */
  text?: string;
  ids?: readonly string[];
  limit?: number;
}

export interface ApplyResult {
  applied: string[];
  rejected: { client_id: string; code: string }[];
}

export interface PlannerStore {
  profile(): Promise<Profile>;
  tasks(q: TaskQuery): Promise<Row[]>;
  /** One task in any state, or null when it is gone or not the caller's. */
  task(id: string): Promise<Row | null>;
  /** Tag names per task, for the given tasks, with each link's id. */
  taskTags(taskIds: readonly string[]): Promise<{ task_id: string; tag_id: string; name: string; link_id: string }[]>;
  checklist(taskId: string): Promise<Row[]>;
  projects(): Promise<Row[]>;
  areas(): Promise<Row[]>;
  tags(): Promise<Row[]>;
  workHours(): Promise<Row[]>;
  calendars(): Promise<Row[]>;
  /** Timed events starting between the two ISO dates (inclusive), and all-day ones overlapping them. */
  events(from: string, to: string): Promise<Row[]>;
  /** Live blocks starting between the two ISO dates (inclusive). */
  blocks(from: string, to: string): Promise<Row[]>;
  /** A task's live blocks. */
  blocksOf(taskId: string): Promise<Row[]>;
  /** A series' exceptions, live ones only. */
  exceptions(seriesId: string): Promise<Row[]>;
  lists(): Promise<Row[]>;
  items(q: { listIds?: readonly string[]; ids?: readonly string[]; text?: string; limit?: number }): Promise<Row[]>;
  itemTags(itemIds: readonly string[]): Promise<{ item_id: string; tag_id: string; name: string; link_id: string }[]>;
  /** Sort keys of the open tasks in one list (a project, an area, or neither). */
  taskSortKeys(projectId: string | null, areaId: string | null): Promise<string[]>;
  daySortKeys(doDate: string): Promise<string[]>;
  projectSortKeys(areaId: string | null): Promise<string[]>;
  listSortKeys(parentId: string | null): Promise<string[]>;
  itemSortKeys(listId: string): Promise<string[]>;
  apply(device: string, ops: readonly WireOp[]): Promise<ApplyResult>;
}

const TASK_COLUMNS =
  "id, space_id, project_id, heading_id, area_id, title, notes_md, state, priority, do_date, do_time, deadline, start_date, evening, estimate_min, carry_count, miss_policy, recurrence_rule, recurrence_mode, recurrence_series_id, recurrence_paused_until, sort_key, day_sort_key, completed_at, created_at, actual_min, routine_run_id, last_carried_at, last_touched_at";
const ITEM_COLUMNS = "id, space_id, list_id, title, note_md, url, status, rating, done_at, preview_title, sort_key, created_at";
/** PostgREST's ceiling on one `in.(…)` list we send: ids are chunked below it. */
const CHUNK = 80;

/** Booleans become 0/1, as the app's mappers (src/data/mappers) read SQLite rows. */
export function toLocal(row: Record<string, unknown>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === "boolean" ? (v ? 1 : 0) : (v as string | number | null);
  return out;
}

/** `%`, `_` and `\` typed by a person are literal; `*` is PostgREST's wildcard. */
export function ilikePattern(text: string): string {
  return `*${text.replace(/[\\%_*]/g, (c) => `\\${c}`)}*`;
}

const chunks = <T>(xs: readonly T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
};

export class StoreError extends Error {}

export class SupabaseStore implements PlannerStore {
  constructor(
    private readonly db: SupabaseClient,
    private readonly userId: string,
  ) {}

  private async rows(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
    const { data, error } = await query;
    if (error) throw new StoreError(error.message);
    return ((data as Record<string, unknown>[] | null) ?? []).map(toLocal);
  }

  async profile(): Promise<Profile> {
    const [users, settings] = await Promise.all([
      this.rows(this.db.from("users").select("id, personal_space_id").eq("id", this.userId).limit(1)),
      this.rows(this.db.from("user_settings").select("*").eq("user_id", this.userId).limit(1)),
    ]);
    const space = users[0]?.personal_space_id;
    if (typeof space !== "string") throw new StoreError("no personal space");
    return { userId: this.userId, spaceId: space, settings: settings[0] ?? null };
  }

  async tasks(q: TaskQuery): Promise<Row[]> {
    const run = async (ids: readonly string[] | null, column?: "title" | "notes_md") => {
      let s = this.db.from("tasks").select(TASK_COLUMNS).is("deleted_at", null).in("state", [...q.states]);
      if (q.doDateLte) s = s.lte("do_date", q.doDateLte);
      if (q.doDateGt) s = s.gt("do_date", q.doDateGt);
      if (q.undated) s = s.is("do_date", null);
      if (q.startedBy) s = s.or(`start_date.is.null,start_date.lte.${q.startedBy}`);
      if (q.startsAfter) s = s.gt("start_date", q.startsAfter);
      if (ids) s = s.in("id", [...ids]);
      if (column && q.text) s = s.ilike(column, ilikePattern(q.text));
      return this.rows(s.limit(q.limit ?? 1000));
    };
    if (q.ids) return (await Promise.all(chunks(q.ids).map((c) => run(c)))).flat();
    if (q.text) {
      const [byTitle, byNote] = await Promise.all([run(null, "title"), run(null, "notes_md")]);
      const seen = new Set(byTitle.map((r) => r.id));
      return [...byTitle, ...byNote.filter((r) => !seen.has(r.id))];
    }
    return run(null);
  }

  async task(id: string): Promise<Row | null> {
    return (await this.rows(this.db.from("tasks").select(TASK_COLUMNS).eq("id", id).is("deleted_at", null).limit(1)))[0] ?? null;
  }

  async taskTags(taskIds: readonly string[]) {
    if (taskIds.length === 0) return [];
    const tags = new Map((await this.tags()).map((t) => [String(t.id), String(t.name ?? "")]));
    const links = (await Promise.all(chunks(taskIds).map((c) => this.rows(this.db.from("task_tags").select("id, task_id, tag_id").is("deleted_at", null).in("task_id", c))))).flat();
    return links
      .filter((l) => tags.has(String(l.tag_id)))
      .map((l) => ({ task_id: String(l.task_id), tag_id: String(l.tag_id), name: tags.get(String(l.tag_id)) as string, link_id: String(l.id) }));
  }

  checklist(taskId: string) {
    return this.rows(this.db.from("checklist_items").select("id, title, done, sort_key").eq("task_id", taskId).is("deleted_at", null));
  }

  projects() {
    return this.rows(this.db.from("projects").select("id, area_id, name, state, deadline, sort_key").is("deleted_at", null));
  }

  areas() {
    return this.rows(this.db.from("areas").select("id, name, sort_key").is("deleted_at", null));
  }

  tags() {
    return this.rows(this.db.from("tags").select("id, name").is("deleted_at", null));
  }

  workHours() {
    return this.rows(this.db.from("work_hours").select("weekday, start_time, end_time").is("deleted_at", null));
  }

  calendars() {
    return this.rows(this.db.from("calendars").select("id, read, private").is("deleted_at", null));
  }

  async events(from: string, to: string) {
    const cols = "id, calendar_id, summary, start_at, end_at, start_date, end_date, all_day, busy, status, self_response, event_type, is_ours";
    const [timed, allDay] = await Promise.all([
      this.rows(this.db.from("calendar_events").select(cols).is("deleted_at", null).gte("start_at", `${from}T00:00:00Z`).lt("start_at", `${nextDay(to)}T00:00:00Z`)),
      this.rows(this.db.from("calendar_events").select(cols).is("deleted_at", null).is("start_at", null).lte("start_date", to).or(`end_date.is.null,end_date.gte.${from}`)),
    ]);
    return [...timed, ...allDay];
  }

  blocks(from: string, to: string) {
    return this.rows(
      this.db
        .from("time_blocks")
        .select("id, task_id, title, start_at, end_at, locked")
        .is("deleted_at", null)
        .gte("start_at", `${from}T00:00:00Z`)
        .lt("start_at", `${nextDay(to)}T00:00:00Z`),
    );
  }

  blocksOf(taskId: string) {
    return this.rows(this.db.from("time_blocks").select("id, task_id, start_at, end_at, locked").eq("task_id", taskId).is("deleted_at", null));
  }

  exceptions(seriesId: string) {
    return this.rows(this.db.from("recurrence_exceptions").select("id, occurrence_date, kind, moved_to").eq("series_id", seriesId).is("deleted_at", null));
  }

  lists() {
    return this.rows(this.db.from("lists").select("id, space_id, parent_id, name, emoji, item_order, hide_done, sort_key, created_at").is("deleted_at", null));
  }

  async items(q: { listIds?: readonly string[]; ids?: readonly string[]; text?: string; limit?: number }) {
    const run = (column?: "title" | "note_md", ids?: readonly string[], listIds?: readonly string[]) => {
      let s = this.db.from("list_items").select(ITEM_COLUMNS).is("deleted_at", null);
      if (listIds) s = s.in("list_id", [...listIds]);
      if (ids) s = s.in("id", [...ids]);
      if (column && q.text) s = s.ilike(column, ilikePattern(q.text));
      return this.rows(s.limit(q.limit ?? 2000));
    };
    if (q.ids) return (await Promise.all(chunks(q.ids).map((c) => run(undefined, c)))).flat();
    if (q.listIds) return (await Promise.all(chunks(q.listIds).map((c) => run(undefined, undefined, c)))).flat();
    if (q.text) {
      const [byTitle, byNote] = await Promise.all([run("title"), run("note_md")]);
      const seen = new Set(byTitle.map((r) => r.id));
      return [...byTitle, ...byNote.filter((r) => !seen.has(r.id))];
    }
    return run();
  }

  async itemTags(itemIds: readonly string[]) {
    if (itemIds.length === 0) return [];
    const tags = new Map((await this.tags()).map((t) => [String(t.id), String(t.name ?? "")]));
    const links = (await Promise.all(chunks(itemIds).map((c) => this.rows(this.db.from("list_item_tags").select("id, item_id, tag_id").is("deleted_at", null).in("item_id", c))))).flat();
    return links
      .filter((l) => tags.has(String(l.tag_id)))
      .map((l) => ({ item_id: String(l.item_id), tag_id: String(l.tag_id), name: tags.get(String(l.tag_id)) as string, link_id: String(l.id) }));
  }

  private keys(rows: Row[], column = "sort_key"): string[] {
    return rows.map((r) => r[column]).filter((k): k is string => typeof k === "string");
  }

  async taskSortKeys(projectId: string | null, areaId: string | null) {
    let s = this.db.from("tasks").select("sort_key").is("deleted_at", null).in("state", ["inbox", "active", "someday"]);
    s = projectId ? s.eq("project_id", projectId) : s.is("project_id", null);
    s = areaId ? s.eq("area_id", areaId) : s.is("area_id", null);
    return this.keys(await this.rows(s.limit(10000)));
  }

  async daySortKeys(doDate: string) {
    return this.keys(await this.rows(this.db.from("tasks").select("day_sort_key").is("deleted_at", null).eq("do_date", doDate).not("day_sort_key", "is", null).limit(10000)), "day_sort_key");
  }

  async projectSortKeys(areaId: string | null) {
    const s = this.db.from("projects").select("sort_key").is("deleted_at", null);
    return this.keys(await this.rows((areaId ? s.eq("area_id", areaId) : s.is("area_id", null)).limit(10000)));
  }

  async listSortKeys(parentId: string | null) {
    const s = this.db.from("lists").select("sort_key").is("deleted_at", null);
    return this.keys(await this.rows((parentId ? s.eq("parent_id", parentId) : s.is("parent_id", null)).limit(10000)));
  }

  async itemSortKeys(listId: string) {
    return this.keys(await this.rows(this.db.from("list_items").select("sort_key").is("deleted_at", null).eq("list_id", listId).limit(10000)));
  }

  async apply(device: string, ops: readonly WireOp[]): Promise<ApplyResult> {
    const { data, error } = await this.db.rpc("apply_mutations", { p_device: device, p_ops: ops });
    if (error) throw new StoreError(error.message);
    return data as ApplyResult;
  }
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
