// Duplicate a task or a project (SCREENS.md §10 footer ⋯ "Duplicate", §9 project header ⋯ "duplicate", §12
// "Selected task"). Loaded on the tap that asks for it, never with a shell (SYSTEM_DESIGN.md §11.6).
//
// A task's copy takes its title, note, checklist (every step unticked), tags, project and heading, estimate,
// priority, dates, miss policy and repeat rule — the rule as a series of its own — and none of what happened to
// it: not its done or dropped state, its blocks, its carries or its archive batch. It sits right after the
// original, in its list and in its day. A project's copy is named "… (copy)" and takes its area, note, dates,
// headings and open tasks, each with its steps and tags. Each is one transaction with one undo entry that takes
// the copy away again.
import { keyBetween } from "@/core/ordering";
import type { LocalDatabase } from "../powersync";
import { placeholders, quoted, type RowSnapshot, type Tx, type UndoRecorder } from "./undo";

/** A copy is made in the app, so its source is the app's own (the server checks it against a closed list). */
const SOURCE = "quickadd";
const OPEN_STATES = ["inbox", "active", "someday"];
const OPEN = `('inbox', 'active', 'someday')`;

/** The columns a copy takes over from its original unchanged. */
const COPIED = [
  "space_id",
  "project_id",
  "heading_id",
  "title",
  "notes_md",
  "priority",
  "do_date",
  "do_time",
  "deadline",
  "start_date",
  "evening",
  "estimate_min",
  "miss_policy",
  "recurrence_rule",
  "recurrence_mode",
] as const;

interface Made {
  tasks: string[];
  links: string[];
  steps: string[];
  headings: string[];
  projects: string[];
}

const empty = (): Made => ({ tasks: [], links: [], steps: [], headings: [], projects: [] });
const text = (v: string | number | null | undefined): string | null => (v == null ? null : String(v));

/**
 * The state a copy starts in: an open original's own; a finished one's copy is open again, in the Inbox when
 * nothing files or dates it (PRODUCT_SPEC.md §5.1 rule 5), else active.
 */
export function copyState(row: Record<string, string | number | null | undefined>): string {
  const state = text(row.state) ?? "";
  if (OPEN_STATES.includes(state)) return state;
  return row.project_id || row.do_date || row.deadline || row.start_date ? "active" : "inbox";
}

/** The key that sorts right after `key` in `column` among the rows `where` picks, or at the end when it has none. */
async function keyAfter(tx: Pick<Tx, "getOptional">, table: "tasks" | "projects", column: "sort_key" | "day_sort_key", where: string, args: (string | null)[], key: string | null): Promise<string> {
  const from = `select ${column} as k from ${table} where deleted_at is null and ${column} is not null and ${where}`;
  if (!key) {
    const last = await tx.getOptional<{ k: string | null }>(`${from} order by ${column} desc limit 1`, args);
    return keyBetween(last?.k ?? null, null);
  }
  const next = await tx.getOptional<{ k: string | null }>(`${from} and ${column} > ? order by ${column} limit 1`, [...args, key]);
  return keyBetween(key, next?.k ?? null);
}

/** Right after the original in its day's order. */
const dayKeyAfter = (tx: Pick<Tx, "getOptional">, doDate: string, key: string | null) => keyAfter(tx, "tasks", "day_sort_key", "do_date = ?", [doDate], key);

/** Inserts one task's copy (with its steps and tags) and returns its id. */
async function copyTask(
  tx: Tx,
  row: RowSnapshot,
  made: Made,
  now: string,
  place: { projectId: string | null; headingId: string | null; sortKey: string; daySortKey: string | null },
): Promise<string> {
  const id = crypto.randomUUID();
  const values: Record<string, string | number | null> = {};
  for (const c of COPIED) values[c] = row[c] ?? null;
  Object.assign(values, {
    id,
    project_id: place.projectId,
    heading_id: place.headingId,
    state: copyState({ ...row, project_id: place.projectId }),
    // A repeat's copy is the head of a series of its own; the original's skips and moves stay with the original.
    recurrence_series_id: row.recurrence_rule ? id : null,
    sort_key: place.sortKey,
    day_sort_key: place.daySortKey,
    carry_count: 0,
    last_touched_at: now,
    source: SOURCE,
    created_at: now,
    updated_at: now,
  });
  const cols = Object.keys(values);
  await tx.execute(`insert into tasks (${cols.join(", ")}) values (${placeholders(cols)})`, cols.map((c) => values[c]));
  made.tasks.push(id);

  const steps = await tx.getAll<{ title: string | null; sort_key: string | null }>(`select title, sort_key from checklist_items where task_id = ? and deleted_at is null order by sort_key, id`, [row.id]);
  for (const step of steps) {
    const stepId = crypto.randomUUID();
    await tx.execute(`insert into checklist_items (id, space_id, task_id, title, done, sort_key, created_at, updated_at) values (?, ?, ?, ?, 0, ?, ?, ?)`, [
      stepId,
      text(row.space_id),
      id,
      step.title,
      step.sort_key,
      now,
      now,
    ]);
    made.steps.push(stepId);
  }
  const tags = await tx.getAll<{ tag_id: string }>(`select distinct tag_id from task_tags where task_id = ? and deleted_at is null`, [row.id]);
  for (const tag of tags) {
    const linkId = crypto.randomUUID();
    await tx.execute(`insert into task_tags (id, space_id, task_id, tag_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)`, [linkId, text(row.space_id), id, tag.tag_id, now, now]);
    made.links.push(linkId);
  }
  return id;
}

/** One undo entry that soft-deletes everything the copy made, in one transaction. */
function recordUndo(db: LocalDatabase, history: UndoRecorder | undefined, made: Made, label: string, onUndone?: () => void): void {
  history?.record({
    label,
    toast: true,
    rows: { task_tags: made.links, checklist_items: made.steps, tasks: made.tasks, headings: made.headings, projects: made.projects },
    undo: async () => {
      await db.writeTransaction(async (tx) => {
        const at = new Date().toISOString();
        const gone = async (table: string, ids: readonly string[]) => {
          if (ids.length > 0) await tx.execute(`update ${table} set deleted_at = ?, updated_at = ? where id in (${placeholders(ids)}) and deleted_at is null`, [at, at, ...ids]);
        };
        await gone("task_tags", made.links);
        await gone("checklist_items", made.steps);
        await gone("tasks", made.tasks);
        await gone("headings", made.headings);
        await gone("projects", made.projects);
      });
      onUndone?.();
    },
  });
}

/**
 * Duplicates the task right after itself and resolves the copy's id, or null when the task is not on this device.
 * `onUndone` runs once the undo has taken the copy away (a detail showing it can close).
 */
export async function duplicateTask(db: LocalDatabase, history: UndoRecorder | undefined, taskId: string, onUndone?: (copyId: string) => void): Promise<string | null> {
  const now = new Date().toISOString();
  const made = empty();
  const out = await db.writeTransaction(async (tx) => {
    const row = await tx.getOptional<RowSnapshot>(`select * from tasks where id = ? and deleted_at is null`, [taskId]);
    if (!row) return null;
    const projectId = text(row.project_id);
    const sortKey = await keyAfter(tx, "tasks", "sort_key", `state in ${OPEN} and coalesce(project_id, '') = coalesce(?, '')`, [projectId], text(row.sort_key));
    const doDate = text(row.do_date);
    const daySortKey = doDate ? await dayKeyAfter(tx, doDate, text(row.day_sort_key)) : null;
    const id = await copyTask(tx, row, made, now, { projectId, headingId: text(row.heading_id), sortKey, daySortKey });
    return { id, title: row.title };
  });
  if (!out) return null;
  recordUndo(db, history, made, `Duplicated ${quoted(out.title)}`, () => onUndone?.(out.id));
  return out.id;
}

/**
 * Duplicates the project — "Name (copy)", right after it in its area — with its headings and its open tasks, and
 * resolves the copy's id, or null when the project is not on this device.
 */
export async function duplicateProject(db: LocalDatabase, history: UndoRecorder | undefined, projectId: string, onUndone?: (copyId: string) => void): Promise<string | null> {
  const now = new Date().toISOString();
  const made = empty();
  const out = await db.writeTransaction(async (tx) => {
    const project = await tx.getOptional<RowSnapshot>(`select * from projects where id = ? and deleted_at is null`, [projectId]);
    if (!project) return null;
    const id = crypto.randomUUID();
    const areaId = text(project.area_id);
    const name = `${String(project.name ?? "").trim() || "Untitled project"} (copy)`;
    const sortKey = await keyAfter(tx, "projects", "sort_key", `coalesce(area_id, '') = coalesce(?, '')`, [areaId], text(project.sort_key));
    await tx.execute(`insert into projects (id, space_id, area_id, name, notes_md, state, do_date, deadline, sort_key, created_at, updated_at) values (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`, [
      id,
      text(project.space_id),
      areaId,
      name,
      text(project.notes_md),
      text(project.do_date),
      text(project.deadline),
      sortKey,
      now,
      now,
    ]);
    made.projects.push(id);

    const headingIds = new Map<string, string>();
    const headings = await tx.getAll<RowSnapshot>(`select * from headings where project_id = ? and deleted_at is null order by sort_key, id`, [projectId]);
    for (const h of headings) {
      const hid = crypto.randomUUID();
      await tx.execute(`insert into headings (id, space_id, project_id, title, sort_key, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)`, [hid, text(h.space_id), id, text(h.title), text(h.sort_key), now, now]);
      headingIds.set(h.id, hid);
      made.headings.push(hid);
    }

    // Each copied task keeps its place in the project; in its day it goes right after its original.
    const tasks = await tx.getAll<RowSnapshot>(`select * from tasks where project_id = ? and deleted_at is null and state in ${OPEN} order by sort_key, id`, [projectId]);
    for (const t of tasks) {
      const doDate = text(t.do_date);
      const daySortKey = doDate ? await dayKeyAfter(tx, doDate, text(t.day_sort_key)) : null;
      const heading = t.heading_id ? (headingIds.get(String(t.heading_id)) ?? null) : null;
      await copyTask(tx, t, made, now, { projectId: id, headingId: heading, sortKey: text(t.sort_key) ?? keyBetween(null, null), daySortKey });
    }
    return { id, name: project.name };
  });
  if (!out) return null;
  recordUndo(db, history, made, `Duplicated ${quoted(out.name)}`, () => onUndone?.(out.id));
  return out.id;
}
