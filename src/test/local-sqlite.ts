// An in-memory SQLite standing in for the device's local database in
// repository tests, so a state rule or an undo is checked by running its SQL,
// not by reading it. Node's built-in `node:sqlite` (Node 22.13+; CI runs 24).
// The tables carry the columns the repositories write (src/data/schema.client.ts);
// the real ones are PowerSync views, which take the same statements.
// `drop(table, id)` stands in for sync taking a row off the device.
import { createRequire } from "node:module";
import type { LocalDatabase } from "@/data/powersync";

type Value = string | number | null;
export type Row = Record<string, Value>;

interface Statement {
  run: (...args: Value[]) => unknown;
  all: (...args: Value[]) => Row[];
}
interface DatabaseSync {
  exec: (sql: string) => void;
  prepare: (sql: string) => Statement;
}

const BASE = "id text primary key, space_id text, created_at text, updated_at text, deleted_at text";
const TABLES: Record<string, string> = {
  tasks: `project_id, heading_id, area_id, assignee_id, title, notes_md, state, priority, do_date, do_time, deadline, start_date, evening, estimate_min, actual_min,
          carry_count, last_carried_at, last_touched_at, miss_policy, recurrence_rule, recurrence_mode, recurrence_series_id, recurrence_paused_until,
          sort_key, day_sort_key, source, routine_run_id, routine_item_key, routine_item_id, routine_date, completed_at, expired_at, auto_filed_at,
          carry_asked_at, archive_batch_id, archived_from_state, archived_at`,
  projects: "area_id, name, notes_md, state, do_date, deadline, completed_at, sort_key",
  headings: "project_id, title, sort_key",
  areas: "name, icon, color, sort_key",
  tags: "name, color",
  task_tags: "task_id, tag_id",
  checklist_items: "task_id, title, done, sort_key",
  recurrence_exceptions: "series_id, occurrence_date, kind, moved_to",
  task_completions: "task_id, occurrence_date, completed_at, actual_min",
  time_blocks: "user_id, task_id, title, start_at, end_at, locked, source, routine_run_id, routine_item_key, routine_date, calendar_id, external_event_id, external_etag, push_state, notice",
  user_settings: "user_id, timezone, day_rollover_hour, default_miss_policy, onboarded_at",
  work_hours: "user_id, weekday, start_time, end_time",
};

export function localSqlite() {
  const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => DatabaseSync };
  const raw = new DatabaseSync(":memory:");
  for (const [name, cols] of Object.entries(TABLES)) raw.exec(`create table ${name} (${BASE}, ${cols})`);

  const all = (sql: string, args: readonly Value[] = []) => raw.prepare(sql).all(...args).map((r) => ({ ...r }));
  const tx = {
    execute: async (sql: string, args: readonly Value[] = []) => {
      raw.prepare(sql).run(...args);
      return {};
    },
    getAll: async (sql: string, args: readonly Value[] = []) => all(sql, args),
    getOptional: async (sql: string, args: readonly Value[] = []) => all(sql, args)[0] ?? null,
  };
  // Statements run on the database itself rather than inside a writeTransaction, so a test can show that a
  // presence check and the write after it were never split (sync could run between two separate statements).
  const outside: string[] = [];
  const logged =
    <A extends unknown[], R>(fn: (sql: string, ...rest: A) => R) =>
    (sql: string, ...rest: A) => {
      outside.push(sql);
      return fn(sql, ...rest);
    };
  const db = {
    execute: logged(tx.execute),
    getAll: logged(tx.getAll),
    getOptional: logged(tx.getOptional),
    writeTransaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
  } as unknown as LocalDatabase;

  return {
    db,
    /** Every statement run outside a writeTransaction, in order; clear it with `outside.length = 0`. */
    outside,
    /** Inserts a row with the given columns. */
    insert(table: string, row: Row) {
      const cols = Object.keys(row);
      raw.prepare(`insert into ${table} (${cols.join(", ")}) values (${cols.map(() => "?").join(", ")})`).run(...cols.map((c) => row[c]));
    },
    /** Every row the query returns. */
    rows: all,
    /** One row by id, or null. */
    row: (table: string, id: string): Row | null => all(`select * from ${table} where id = ?`, [id])[0] ?? null,
    /** Sync taking a row off the device: it is simply gone. */
    drop: (table: string, id: string) => void raw.prepare(`delete from ${table} where id = ?`).run(id),
  };
}
