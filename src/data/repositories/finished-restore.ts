// Reopening a task from the older Logbook (DECISIONS.md, amendment 2026-11-14). A task finished more than a week
// ago is not on the device: the server keeps it in `finished_tasks` with its steps and tags folded into the row.
// Reopen writes it back as a task here, with its steps and the tags that still exist, and the usual upload carries
// it to the server, where the finished row goes as the task arrives (migration 20261114000100). Where it was
// filed may be gone since (a project, heading or area deleted in the meantime): it then comes back unfiled rather
// than into a place no screen shows. One transaction, one undo entry that finishes it again as it was. Loaded with
// the Logbook and search's older results, never with a shell (SYSTEM_DESIGN.md §11.6).
import { keyBetween } from "@/core/ordering";
import type { LocalDatabase } from "../powersync";
import { placeholders, quoted, type UndoRecorder } from "./undo";

/** The finished row's own columns that come back with the task. Server-owned ones are left to the server. */
const RESTORED = [
  "id",
  "space_id",
  "project_id",
  "heading_id",
  "area_id",
  "title",
  "notes_md",
  "priority",
  "do_date",
  "do_time",
  "deadline",
  "start_date",
  "estimate_min",
  "actual_min",
  "miss_policy",
  "recurrence_rule",
  "recurrence_mode",
  "recurrence_series_id",
  "recurrence_paused_until",
  "sort_key",
  "day_sort_key",
  "source",
  "created_at",
] as const;

type Value = string | number | boolean | null | undefined;

export interface FinishedToRestore {
  id: string;
  space_id: string | null;
  title: string | null;
  completed_at: string | null;
  evening: boolean | number | null;
  checklist: { title: string; done: boolean }[] | null;
  tag_ids: string[] | null;
  occurrence_of: string | null;
  [column: string]: unknown;
}

/**
 * The state a reopened task takes, as un-completing one on the device does (task-repo.ts `reopen`, PRODUCT_SPEC.md
 * §7 rule 2): nothing filing or dating it is the Inbox, anything else is active. The do date stays, so a past one
 * lands the task in Carried over.
 */
export function reopenedState(row: Record<string, unknown>): "inbox" | "active" {
  return row.project_id || row.area_id || row.do_date || row.deadline || row.start_date ? "active" : "inbox";
}

/** Puts a finished task back among the tasks. Resolves to its id; a repeat's occurrence is not a task to reopen. */
export async function restoreFinished(db: LocalDatabase, history: UndoRecorder | null | undefined, row: FinishedToRestore): Promise<string | null> {
  if (row.occurrence_of || !row.space_id) return null;
  const id = row.id;
  const now = new Date().toISOString();
  const values: Record<string, string | number | null> = {};
  for (const c of RESTORED) {
    const v = row[c] as Value;
    values[c] = v == null ? null : typeof v === "boolean" ? (v ? 1 : 0) : v;
  }
  Object.assign(values, {
    evening: row.evening === true || row.evening === 1 ? 1 : 0,
    completed_at: null,
    carry_count: 0,
    last_touched_at: now,
    updated_at: now,
  });
  const stepIds: string[] = [];
  const linkIds: string[] = [];
  const wrote = await db.writeTransaction(async (tx) => {
    // Already back (a second tap, or another device reopened it and it has synced): nothing to write twice.
    if (await tx.getOptional<{ id: string }>(`select id from tasks where id = ?`, [id])) return false;
    // Filed only where the place is still there: a project (and its heading), or an area.
    const there = async (table: "projects" | "headings" | "areas", ref: string | number | null) =>
      ref != null && Boolean(await tx.getOptional<{ id: string }>(`select id from ${table} where id = ? and deleted_at is null`, [ref]));
    if (!(await there("projects", values.project_id))) values.project_id = null;
    if (!values.project_id || !(await there("headings", values.heading_id))) values.heading_id = null;
    if (!(await there("areas", values.area_id))) values.area_id = null;
    values.state = reopenedState(values);
    const cols = Object.keys(values);
    await tx.execute(`insert into tasks (${cols.join(", ")}) values (${placeholders(cols)})`, cols.map((c) => values[c]));
    let key: string | null = null;
    for (const step of row.checklist ?? []) {
      const stepId = crypto.randomUUID();
      key = keyBetween(key, null);
      await tx.execute(`insert into checklist_items (id, space_id, task_id, title, done, sort_key, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)`, [stepId, row.space_id, id, step.title, step.done ? 1 : 0, key, now, now]);
      stepIds.push(stepId);
    }
    // A tag deleted since is not brought back with it.
    const tagIds = [...new Set(row.tag_ids ?? [])];
    const live = tagIds.length ? await tx.getAll<{ id: string }>(`select id from tags where deleted_at is null and id in (${placeholders(tagIds)})`, tagIds) : [];
    for (const tag of live) {
      const linkId = crypto.randomUUID();
      await tx.execute(`insert into task_tags (id, space_id, task_id, tag_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)`, [linkId, row.space_id, id, tag.id, now, now]);
      linkIds.push(linkId);
    }
    return true;
  });
  if (!wrote) return id;
  history?.record({
    label: `Reopened ${quoted(row.title)}`,
    toast: true,
    rows: { tasks: [id], checklist_items: stepIds, task_tags: linkIds },
    // Finished again as it was: it leaves the device with the next sync and is older Logbook once more.
    undo: async () => {
      await db.execute(`update tasks set state = 'done', completed_at = ?, updated_at = ? where id = ?`, [row.completed_at, new Date().toISOString(), id]);
    },
  });
  return id;
}
