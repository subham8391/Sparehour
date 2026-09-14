// Task writes. Each call is one local transaction; PowerSync uploads it
// through the connector. Only the moved/changed columns are written, which
// is what makes per-column last-writer-wins work (§4.3).
import { keyBetween } from "@/core/ordering";
import type { TaskDraft } from "@/core/quickadd";
import type { LocalDate, LocalTime } from "@/core/time";
import type { MissPolicy, Priority, RecurrenceMode } from "@/core/types";
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

  private async snapshot(id: string, columns: readonly string[]): Promise<Snapshot | null> {
    if (!this.history) return null;
    return (await this.db.getOptional<Snapshot>(`select title, ${columns.join(", ")} from tasks where id = ?`, [id])) ?? null;
  }

  private remember(id: string, before: Snapshot | null, columns: readonly string[], label: string, toast: boolean): void {
    if (!this.history || !before) return;
    const title = `“${String(before.title ?? "")}”`;
    this.history.record({
      label: label.includes("{title}") ? label.replace("{title}", title) : `${label} ${title}`,
      toast,
      undo: () =>
        this.db
          .execute(`update tasks set ${columns.map((c) => `${c} = ?`).join(", ")}, updated_at = ? where id = ?`, [...columns.map((c) => before[c] ?? null), new Date().toISOString(), id])
          .then(() => undefined),
    });
  }

  private async snapshotMany(ids: readonly string[], columns: readonly string[]): Promise<RowSnapshot[]> {
    if (!this.history || columns.length === 0) return [];
    return this.db.getAll<RowSnapshot>(`select id, title, ${columns.join(", ")} from tasks where id in (${placeholders(ids)})`, [...ids]);
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
          for (const row of before) {
            await tx.execute(`update tasks set ${columns.map((c) => `${c} = ?`).join(", ")}, updated_at = ? where id = ?`, [...columns.map((c) => row[c] ?? null), at, row.id]);
          }
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
    const cols = ["state", "completed_at"];
    const before = await this.snapshot(id, cols);
    const now = new Date().toISOString();
    await this.db.execute(`update tasks set state = 'done', completed_at = ?, updated_at = ? where id = ?`, [now, now, id]);
    this.remember(id, before, cols, "Completed", true);
  }

  async completeMany(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const cols = ["state", "completed_at"];
    const before = await this.snapshotMany(ids, cols);
    const now = new Date().toISOString();
    await this.db.execute(`update tasks set state = 'done', completed_at = ?, updated_at = ? where id in (${placeholders(ids)})`, [now, now, ...ids]);
    this.rememberMany(before, cols, "Completed", true);
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
type RowSnapshot = Snapshot & { id: string };

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
