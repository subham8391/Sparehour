// Task writes. Each call is one local transaction; PowerSync uploads it
// through the connector. Only the moved/changed columns are written, which
// is what makes per-column last-writer-wins work (§4.3).
import { keyBetween } from "@/core/ordering";
import type { TaskDraft } from "@/core/quickadd";
import { Temporal, localDate, todayFor, type LocalDate, type LocalTime } from "@/core/time";
import type { MissPolicy, Priority, RecurrenceException, RecurrenceMode } from "@/core/types";
import type { LocalDatabase } from "../powersync";

/** The fields a person edits in the detail panel. Only the keys present are written. */
export interface TaskPatch {
  title?: string;
  notes?: string | null;
  doDate?: LocalDate | null;
  doTime?: LocalTime | null;
  evening?: boolean;
  deadline?: LocalDate | null;
  startDate?: LocalDate | null;
  estimateMin?: number | null;
  priority?: Priority;
  missPolicy?: MissPolicy;
  projectId?: string | null;
  recurrenceRule?: string | null;
  recurrenceMode?: RecurrenceMode | null;
}

export interface NewTaskContext {
  spaceId: string;
  /** The project the task belongs to; null for the inbox / no project. */
  projectId?: string | null;
  /** The section inside the project, if any. */
  headingId?: string | null;
  /** Sort key of the item to place the task after in its day list; omitted = at the end. */
  afterKey?: string | null;
}

export type TaskState = "someday" | "dropped" | "archived" | "active";

type Tx = Parameters<Parameters<LocalDatabase["writeTransaction"]>[0]>[0];

/** Where the inverse of each write goes (the undo stack); optional so scripts and tests can skip it. */
export interface UndoRecorder {
  record: (entry: { label: string; toast: boolean; undo: () => Promise<void> }) => void;
}

export class TaskRepo {
  constructor(
    private readonly db: LocalDatabase,
    private readonly history?: UndoRecorder,
  ) {}

  /**
   * Creates the task from a quick-add draft: last in its list and, when it has
   * a day, last in that day's order; tags are matched by name or created.
   * One transaction, so the upload is atomic too.
   */
  async create(draft: TaskDraft, ctx: NewTaskContext): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const projectId = ctx.projectId ?? null;
    const doDate = draft.doDate?.toString() ?? null;

    await this.db.writeTransaction(async (tx) => {
      const lastInList = await tx.getOptional<{ sort_key: string | null }>(
        `select sort_key from tasks where deleted_at is null and state in ('inbox', 'active', 'someday')
           and coalesce(project_id, '') = coalesce(?, '') order by sort_key desc limit 1`,
        [projectId],
      );
      const sortKey = keyBetween(lastInList?.sort_key ?? null, null);

      let daySortKey: string | null = null;
      if (doDate) {
        if (ctx.afterKey !== undefined) {
          daySortKey = keyBetween(ctx.afterKey, null);
        } else {
          const lastInDay = await tx.getOptional<{ day_sort_key: string | null }>(
            `select day_sort_key from tasks where deleted_at is null and do_date = ? and day_sort_key is not null order by day_sort_key desc limit 1`,
            [doDate],
          );
          daySortKey = keyBetween(lastInDay?.day_sort_key ?? null, null);
        }
      }

      await tx.execute(
        `insert into tasks (id, space_id, project_id, heading_id, title, notes_md, state, priority, do_date, do_time, deadline, start_date,
                            evening, estimate_min, carry_count, last_touched_at, miss_policy, recurrence_rule,
                            recurrence_mode, recurrence_series_id, sort_key, day_sort_key, source, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 'quickadd', ?, ?)`,
        [
          id,
          ctx.spaceId,
          projectId,
          ctx.headingId ?? null,
          draft.title,
          draft.notes,
          doDate ? "active" : "inbox",
          draft.priority,
          doDate,
          draft.doTime ? draft.doTime.toString({ smallestUnit: "minute" }) : null,
          draft.deadline?.toString() ?? null,
          draft.startDate?.toString() ?? null,
          draft.evening ? 1 : 0,
          draft.estimateMin,
          now,
          draft.recurrenceRule ? "skip" : "carry",
          draft.recurrenceRule,
          draft.recurrenceMode,
          draft.recurrenceRule ? id : null,
          sortKey,
          daySortKey,
          now,
          now,
        ],
      );

      for (const name of draft.tagNames) {
        const tagId = await this.ensureTag(tx, ctx.spaceId, name, now);
        await tx.execute(`insert into task_tags (id, space_id, task_id, tag_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)`, [
          crypto.randomUUID(),
          ctx.spaceId,
          id,
          tagId,
          now,
          now,
        ]);
      }
    });
    return id;
  }

  private async ensureTag(tx: Tx, spaceId: string, name: string, now: string): Promise<string> {
    const existing = await tx.getOptional<{ id: string }>(`select id from tags where deleted_at is null and lower(name) = lower(?) limit 1`, [name]);
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    await tx.execute(`insert into tags (id, space_id, name, created_at, updated_at) values (?, ?, ?, ?, ?)`, [id, spaceId, name, now, now]);
    return id;
  }

  // ---- undo: each write below snapshots the columns it touches and records the inverse

  // The snapshot is the whole row, not just the columns a write touches: a
  // completed (or deleted) task leaves this device's working set as soon as
  // the change has synced — the tasks stream carries only open rows — so an
  // undo a few seconds later finds nothing to update. Then the row is put
  // back as it was, which the sync layer uploads as an upsert.
  private async snapshot(id: string, columns: readonly string[]): Promise<Snapshot | null> {
    if (!this.history || columns.length === 0) return null;
    return (await this.db.getOptional<Snapshot>(`select * from tasks where id = ?`, [id])) ?? null;
  }

  /**
   * Restores `columns` on one row; if the row has left the device, re-inserts
   * it from the snapshot. Presence is checked with a read: the local tables
   * are views, and an update through them reports zero rows affected either way.
   */
  private async restore(tx: Pick<Tx, "execute" | "getOptional">, before: Snapshot, id: string, columns: readonly string[], at: string): Promise<void> {
    const present = await tx.getOptional<{ id: string }>(`select id from tasks where id = ?`, [id]);
    if (present) {
      await tx.execute(`update tasks set ${columns.map((c) => `${c} = ?`).join(", ")}, updated_at = ? where id = ?`, [...columns.map((c) => before[c] ?? null), at, id]);
      return;
    }
    const row: Snapshot = { ...before, id, updated_at: at };
    const cols = Object.keys(row);
    await tx.execute(`insert into tasks (${cols.join(", ")}) values (${cols.map(() => "?").join(", ")})`, cols.map((c) => row[c] ?? null));
    // The sync layer uploads an insert without its null columns; a second, explicit write carries them.
    await tx.execute(`update tasks set ${columns.map((c) => `${c} = ?`).join(", ")}, updated_at = ? where id = ?`, [...columns.map((c) => before[c] ?? null), at, id]);
  }

  private remember(id: string, before: Snapshot | null, columns: readonly string[], label: string, toast: boolean): void {
    if (!this.history || !before) return;
    const title = `“${String(before.title ?? "")}”`;
    this.history.record({
      label: label.includes("{title}") ? label.replace("{title}", title) : `${label} ${title}`,
      toast,
      undo: () => this.restore(this.db, before, id, columns, new Date().toISOString()),
    });
  }

  private async snapshotMany(ids: readonly string[], columns: readonly string[]): Promise<RowSnapshot[]> {
    if (!this.history || columns.length === 0) return [];
    return this.db.getAll<RowSnapshot>(`select * from tasks where id in (${placeholders(ids)})`, [...ids]);
  }

  /** One undo entry for a batch: "Moved 4 tasks to tomorrow" (or the title when it is one). */
  private rememberMany(before: readonly RowSnapshot[], columns: readonly string[], label: string, toast: boolean): void {
    if (!this.history || before.length === 0) return;
    const what = before.length === 1 ? `“${String(before[0].title ?? "")}”` : `${before.length} tasks`;
    this.history.record({
      label: label.includes("{title}") ? label.replace("{title}", what) : `${label} ${what}`,
      toast,
      undo: () =>
        this.db.writeTransaction(async (tx) => {
          const at = new Date().toISOString();
          for (const row of before) await this.restore(tx, row, row.id, columns, at);
        }),
    });
  }

  /**
   * Writes exactly the columns in the patch (per-column last-writer-wins,
   * §4.3). Giving an inbox or Someday task a day makes it active; giving a
   * task its first repeat rule makes it the head of its own series. `note`
   * names the change for the undo toast ("Moved {title} to tomorrow");
   * without one the change is undoable but silent.
   */
  async update(id: string, patch: TaskPatch, note?: string): Promise<void> {
    const touched = columnsTouched(patch);
    const before = touched.length ? await this.snapshot(id, touched) : null;
    const { sets, args } = buildSets(patch);
    if (sets.length === 0) return;
    await this.db.execute(`update tasks set ${sets.join(", ")}, updated_at = ? where id = ?`, [...args, new Date().toISOString(), id]);
    this.remember(id, before, touched, note ?? "Changed", Boolean(note));
  }

  /**
   * The same patch on several tasks at once (multi-select + bulk edit) in one
   * statement, with one undo entry for the lot.
   */
  async updateMany(ids: readonly string[], patch: TaskPatch, note?: string): Promise<void> {
    if (ids.length === 0) return;
    const touched = columnsTouched(patch);
    const { sets, args } = buildSets(patch);
    if (sets.length === 0) return;
    const before = await this.snapshotMany(ids, touched);
    await this.db.execute(`update tasks set ${sets.join(", ")}, updated_at = ? where id in (${placeholders(ids)})`, [...args, new Date().toISOString(), ...ids]);
    this.rememberMany(before, touched, note ?? "Changed", Boolean(note));
  }

  async complete(id: string): Promise<void> {
    // One read serves both questions: does the row repeat, and what did it look like (for the undo).
    const before = (await this.db.getOptional<RowSnapshot>(`select * from tasks where id = ?`, [id])) ?? null;
    if (!before) return;
    const task = recurringOf(before);
    if (task) return this.completeRecurring(task, before);
    const cols = ["state", "completed_at"];
    const now = new Date().toISOString();
    await this.db.execute(`update tasks set state = 'done', completed_at = ?, updated_at = ? where id = ?`, [now, now, id]);
    this.remember(id, before, cols, "Completed", true);
  }

  /**
   * SYSTEM_DESIGN.md §5.2 "Completion": a recurring task is one row that
   * rolls forward. Completing it writes a completion for the scheduled
   * occurrence and moves the row to the next one (or marks it done when the
   * series ends); the checklist resets. Undo removes the completion and puts
   * the row back as it was.
   */
  private async completeRecurring(task: RecurringRow, before: RowSnapshot): Promise<void> {
    // The recurrence engine (rrule) stays out of the app shell: it is loaded the first time a repeat is completed.
    const { nextOccurrence } = await import("@/core/recurrence");
    const settings = await this.db.getOptional<{ timezone: string | null; day_rollover_hour: number | null }>(`select timezone, day_rollover_hour from user_settings limit 1`);
    const today = todayFor({ timezone: settings?.timezone ?? "UTC", dayRolloverHour: settings?.day_rollover_hour ?? 4 }, Temporal.Now.instant());
    const occurrence = task.do_date ? localDate(task.do_date) : today;
    const rows = await this.db.getAll<{ occurrence_date: string; kind: string; moved_to: string | null }>(
      `select occurrence_date, kind, moved_to from recurrence_exceptions where deleted_at is null and series_id = ?`,
      [task.recurrence_series_id ?? task.id],
    );
    const exceptions: RecurrenceException[] = rows.map((e) =>
      e.kind === "move" && e.moved_to ? { occurrenceDate: localDate(e.occurrence_date), kind: "move", movedTo: localDate(e.moved_to) } : { occurrenceDate: localDate(e.occurrence_date), kind: "skip" },
    );
    const next = nextOccurrence({
      rule: task.recurrence_rule as string,
      mode: task.recurrence_mode as RecurrenceMode,
      doDate: occurrence,
      completedOn: today,
      pausedUntil: task.recurrence_paused_until ? localDate(task.recurrence_paused_until) : null,
      exceptions,
    });
    const cols = ["do_date", "state", "completed_at"];
    const now = new Date().toISOString();
    const completionId = crypto.randomUUID();
    await this.db.writeTransaction(async (tx) => {
      await tx.execute(
        `insert into task_completions (id, space_id, task_id, occurrence_date, completed_at, actual_min, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [completionId, task.space_id, task.id, occurrence.toString(), now, task.actual_min ?? null, now, now],
      );
      if (next) {
        await tx.execute(`update tasks set do_date = ?, state = 'active', completed_at = null, updated_at = ? where id = ?`, [next.toString(), now, task.id]);
        await tx.execute(`update checklist_items set done = 0, updated_at = ? where task_id = ? and done = 1 and deleted_at is null`, [now, task.id]);
      } else {
        await tx.execute(`update tasks set state = 'done', completed_at = ?, updated_at = ? where id = ?`, [now, now, task.id]);
      }
    });
    if (!this.history) return;
    this.history.record({
      label: `Completed “${String(before.title ?? "")}”`,
      toast: true,
      undo: () =>
        this.db.writeTransaction(async (tx) => {
          const at = new Date().toISOString();
          await tx.execute(`update task_completions set deleted_at = ?, updated_at = ? where id = ?`, [at, at, completionId]);
          await this.restore(tx, before, task.id, cols, at);
        }),
    });
  }

  async completeMany(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const rows = await this.db.getAll<RowSnapshot>(`select * from tasks where id in (${placeholders(ids)})`, [...ids]);
    // Repeating tasks roll forward one by one; the rest close in one statement.
    const plain: RowSnapshot[] = [];
    for (const row of rows) {
      const task = recurringOf(row);
      if (task) await this.completeRecurring(task, row);
      else plain.push(row);
    }
    if (plain.length === 0) return;
    const plainIds = plain.map((r) => r.id);
    const cols = ["state", "completed_at"];
    const now = new Date().toISOString();
    await this.db.execute(`update tasks set state = 'done', completed_at = ?, updated_at = ? where id in (${placeholders(plainIds)})`, [now, now, ...plainIds]);
    this.rememberMany(plain, cols, "Completed", true);
  }

  async reopen(id: string): Promise<void> {
    const cols = ["state", "completed_at"];
    const before = await this.snapshot(id, cols);
    await this.db.execute(`update tasks set state = 'active', completed_at = null, updated_at = ? where id = ?`, [new Date().toISOString(), id]);
    this.remember(id, before, cols, "Reopened", false);
  }

  async reschedule(id: string, doDate: LocalDate | null): Promise<void> {
    const cols = ["do_date", "do_time", "state"];
    const before = await this.snapshot(id, cols);
    await this.db.execute(`update tasks set do_date = ?, do_time = case when ? is null then null else do_time end, state = 'active', updated_at = ? where id = ?`, [
      doDate?.toString() ?? null,
      doDate?.toString() ?? null,
      new Date().toISOString(),
      id,
    ]);
    this.remember(id, before, cols, doDate ? "Moved" : "Unscheduled", true);
  }

  async setHeading(id: string, headingId: string | null): Promise<void> {
    await this.db.execute(`update tasks set heading_id = ?, updated_at = ? where id = ?`, [headingId, new Date().toISOString(), id]);
  }

  async setDayOrder(id: string, daySortKey: string): Promise<void> {
    await this.db.execute(`update tasks set day_sort_key = ?, updated_at = ? where id = ?`, [daySortKey, new Date().toISOString(), id]);
  }

  /** Position in the project list; with `headingId`, also the section it moved into. */
  async setOrder(id: string, sortKey: string, headingId?: string | null): Promise<void> {
    if (headingId === undefined) await this.db.execute(`update tasks set sort_key = ?, updated_at = ? where id = ?`, [sortKey, new Date().toISOString(), id]);
    else await this.db.execute(`update tasks set sort_key = ?, heading_id = ?, updated_at = ? where id = ?`, [sortKey, headingId, new Date().toISOString(), id]);
  }

  /** Puts the task on `day` at `daySortKey` in one statement (a drop into a day's list). */
  async placeInDay(id: string, day: LocalDate, daySortKey: string, evening = false): Promise<void> {
    await this.db.execute(`update tasks set do_date = ?, day_sort_key = ?, evening = ?, state = case when state in ('inbox', 'someday') then 'active' else state end, updated_at = ? where id = ?`, [
      day.toString(),
      daySortKey,
      evening ? 1 : 0,
      new Date().toISOString(),
      id,
    ]);
  }

  /**
   * "Clear the slate" (§5.3): archives every given task in one transaction and
   * records one undo entry for the whole batch, so a single ⌘Z restores them
   * all. It archives; it never deletes.
   */
  async archiveMany(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const before = this.history ? await this.db.getAll<{ id: string; state: string | null; do_date: string | null }>(`select id, state, do_date from tasks where id in (${placeholders(ids)})`, [...ids]) : [];
    const now = new Date().toISOString();
    await this.db.execute(`update tasks set state = 'archived', do_date = null, carry_count = 0, updated_at = ? where id in (${placeholders(ids)})`, [now, ...ids]);
    if (!this.history || before.length === 0) return;
    this.history.record({
      label: `Cleared the slate · ${before.length} ${before.length === 1 ? "task" : "tasks"}`,
      toast: true,
      undo: () =>
        this.db.writeTransaction(async (tx) => {
          const at = new Date().toISOString();
          for (const row of before) await tx.execute(`update tasks set state = ?, do_date = ?, updated_at = ? where id = ?`, [row.state, row.do_date, at, row.id]);
        }),
    });
  }

  async setState(id: string, state: TaskState): Promise<void> {
    const cols = ["state", "do_date"];
    const before = await this.snapshot(id, cols);
    await this.db.execute(`update tasks set ${STATE_SETS} where id = ?`, [state, state, state, new Date().toISOString(), id]);
    this.remember(id, before, cols, STATE_LABELS[state], state !== "active");
  }

  async setStateMany(ids: readonly string[], state: TaskState): Promise<void> {
    if (ids.length === 0) return;
    const cols = ["state", "do_date"];
    const before = await this.snapshotMany(ids, cols);
    await this.db.execute(`update tasks set ${STATE_SETS} where id in (${placeholders(ids)})`, [state, state, state, new Date().toISOString(), ...ids]);
    this.rememberMany(before, cols, STATE_LABELS[state], state !== "active");
  }
}

type Snapshot = Record<string, string | number | null>;
interface RecurringRow {
  id: string;
  space_id: string;
  do_date: string | null;
  recurrence_rule: string | null;
  recurrence_mode: string | null;
  recurrence_series_id: string | null;
  recurrence_paused_until: string | null;
  actual_min: number | null;
}
type RowSnapshot = Snapshot & { id: string };

const text = (v: string | number | null | undefined): string | null => (v == null ? null : String(v));

/** The recurrence fields of a row that repeats (a rule and a mode), else null. */
function recurringOf(row: RowSnapshot): RecurringRow | null {
  if (!row.recurrence_rule || !row.recurrence_mode) return null;
  return {
    id: row.id,
    space_id: String(row.space_id ?? ""),
    do_date: text(row.do_date),
    recurrence_rule: String(row.recurrence_rule),
    recurrence_mode: String(row.recurrence_mode),
    recurrence_series_id: text(row.recurrence_series_id),
    recurrence_paused_until: text(row.recurrence_paused_until),
    actual_min: typeof row.actual_min === "number" ? row.actual_min : null,
  };
}

const STATE_SETS = `state = ?, do_date = case when ? in ('someday','archived') then null else do_date end, carry_count = case when ? in ('someday','archived','dropped') then 0 else carry_count end, updated_at = ?`;
const STATE_LABELS: Record<TaskState, string> = { dropped: "Dropped", someday: "Moved {title} to Someday", archived: "Archived", active: "Brought back" };

const placeholders = (ids: readonly string[]) => ids.map(() => "?").join(", ");

/** The SET clause a patch writes, shared by the single and the bulk update. */
function buildSets(patch: TaskPatch): { sets: string[]; args: (string | number | null)[] } {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const set = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    args.push(value);
  };
  if ("title" in patch && patch.title !== undefined) set("title", patch.title.trim());
  if ("notes" in patch) set("notes_md", patch.notes?.trim() || null);
  if ("doDate" in patch) {
    set("do_date", patch.doDate?.toString() ?? null);
    if (patch.doDate) sets.push(`state = case when state in ('inbox', 'someday') then 'active' else state end`);
    else set("do_time", null);
  }
  if ("doTime" in patch) set("do_time", patch.doTime ? patch.doTime.toString({ smallestUnit: "minute" }) : null);
  if ("evening" in patch && patch.evening !== undefined) set("evening", patch.evening ? 1 : 0);
  if ("deadline" in patch) set("deadline", patch.deadline?.toString() ?? null);
  if ("startDate" in patch) set("start_date", patch.startDate?.toString() ?? null);
  if ("estimateMin" in patch) set("estimate_min", patch.estimateMin ?? null);
  if ("priority" in patch && patch.priority !== undefined) set("priority", patch.priority);
  if ("missPolicy" in patch && patch.missPolicy !== undefined) set("miss_policy", patch.missPolicy);
  if ("projectId" in patch) set("project_id", patch.projectId ?? null);
  if ("recurrenceRule" in patch) {
    set("recurrence_rule", patch.recurrenceRule ?? null);
    set("recurrence_mode", patch.recurrenceRule ? (patch.recurrenceMode ?? "fixed") : null);
    sets.push(patch.recurrenceRule ? `recurrence_series_id = coalesce(recurrence_series_id, id)` : `recurrence_series_id = null`);
  } else if ("recurrenceMode" in patch) {
    set("recurrence_mode", patch.recurrenceMode ?? null);
  }
  return { sets, args };
}

const PATCH_COLUMNS: Record<keyof TaskPatch, readonly string[]> = {
  title: ["title"],
  notes: ["notes_md"],
  doDate: ["do_date", "do_time", "state"],
  doTime: ["do_time"],
  evening: ["evening"],
  deadline: ["deadline"],
  startDate: ["start_date"],
  estimateMin: ["estimate_min"],
  priority: ["priority"],
  missPolicy: ["miss_policy"],
  projectId: ["project_id"],
  recurrenceRule: ["recurrence_rule", "recurrence_mode", "recurrence_series_id"],
  recurrenceMode: ["recurrence_mode"],
};

/** The columns a patch writes, for the snapshot that undoes it. */
export function columnsTouched(patch: TaskPatch): string[] {
  const out = new Set<string>();
  for (const key of Object.keys(patch) as (keyof TaskPatch)[]) for (const c of PATCH_COLUMNS[key] ?? []) out.add(c);
  return [...out];
}
