// Task writes. Each call is one local transaction; PowerSync uploads it
// through the connector. Only the moved/changed columns are written, which
// is what makes per-column last-writer-wins work (§4.3).
import { keyBetween } from "@/core/ordering";
import type { TaskDraft } from "@/core/quickadd";
import { Temporal, todayFor, type LocalDate, type LocalTime } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { MissPolicy, Priority, RecurrenceMode } from "@/core/types";
import { normaliseTimestamp } from "../mappers";
import type { LocalDatabase } from "../powersync";
import { reviveBlocks, type BlockRow } from "./block-repo";
import type { RecurringRow } from "./recurring-completion";
import { placeholders, quoted, restoreRow, type Tx, type UndoRecorder } from "./undo";

export type { UndoRecorder } from "./undo";

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
  /** Files it in a project, out of any area (a task has one or the other, never both); null leaves it unfiled. */
  projectId?: string | null;
  /** Files it directly in an area, out of its project and heading; null takes it out of the area. */
  areaId?: string | null;
  recurrenceRule?: string | null;
  recurrenceMode?: RecurrenceMode | null;
}

export interface NewTaskContext {
  spaceId: string;
  /** The project the task belongs to; null for the inbox / no project. */
  projectId?: string | null;
  /** The section inside the project, if any. */
  headingId?: string | null;
  /** The area it is filed in directly, when it has no project (the area view's add row). */
  areaId?: string | null;
  /** Sort key of the item to place the task after in its day list; omitted = at the end. */
  afterKey?: string | null;
}

export type TaskState = "someday" | "dropped" | "archived" | "active";

export class TaskRepo {
  constructor(
    private readonly db: LocalDatabase,
    private readonly history?: UndoRecorder,
  ) {}

  /**
   * Creates the task from a quick-add draft: last in its list and, when it has
   * a day, last in that day's order; tags are matched by name or created.
   * One transaction, so the upload is atomic too. PRODUCT_SPEC.md §5.1 rule 5:
   * no date and no project → Inbox; any date (do date, deadline, start) or a
   * project → active. A repeating task starts on skip (A6); a one-off one on
   * Settings › Planning's "Default if missed", carry until it is set.
   */
  async create(draft: TaskDraft, ctx: NewTaskContext): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const projectId = ctx.projectId ?? null;
    const areaId = projectId ? null : (ctx.areaId ?? null);
    const doDate = draft.doDate?.toString() ?? null;
    const state = doDate || projectId || areaId || draft.deadline || draft.startDate ? "active" : "inbox";

    await this.db.writeTransaction(async (tx) => {
      const defaults = draft.recurrenceRule ? null : await tx.getOptional<{ default_miss_policy: string | null }>(`select default_miss_policy from user_settings limit 1`);
      const missPolicy: MissPolicy = draft.recurrenceRule ? "skip" : defaults?.default_miss_policy === "skip" || defaults?.default_miss_policy === "expire" ? defaults.default_miss_policy : "carry";
      const lastInList = await tx.getOptional<{ sort_key: string | null }>(
        `select sort_key from tasks where deleted_at is null and state in ('inbox', 'active', 'someday')
           and coalesce(project_id, '') = coalesce(?, '') and coalesce(area_id, '') = coalesce(?, '') order by sort_key desc limit 1`,
        [projectId, areaId],
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
        `insert into tasks (id, space_id, project_id, heading_id, area_id, title, notes_md, state, priority, do_date, do_time, deadline, start_date,
                            evening, estimate_min, carry_count, last_touched_at, miss_policy, recurrence_rule,
                            recurrence_mode, recurrence_series_id, sort_key, day_sort_key, source, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 'quickadd', ?, ?)`,
        [
          id,
          ctx.spaceId,
          projectId,
          ctx.headingId ?? null,
          areaId,
          draft.title,
          draft.notes,
          state,
          draft.priority,
          doDate,
          draft.doTime ? draft.doTime.toString({ smallestUnit: "minute" }) : null,
          draft.deadline?.toString() ?? null,
          draft.startDate?.toString() ?? null,
          draft.evening ? 1 : 0,
          draft.estimateMin,
          now,
          missPolicy,
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

  /**
   * Takes back tasks this device just created (the undo of a multi-line paste, PRODUCT_SPEC.md §5.1 rule 6):
   * each row and its tag links are soft-deleted in one transaction, as if they had never been added. It is
   * itself the inverse of a write, so it records nothing. A row that is already gone is simply not there to
   * update.
   */
  async removeCreated(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    await this.db.writeTransaction(async (tx) => {
      await tx.execute(`update tasks set deleted_at = ?, updated_at = ? where id in (${placeholders(ids)}) and deleted_at is null`, [now, now, ...ids]);
      await tx.execute(`update task_tags set deleted_at = ?, updated_at = ? where task_id in (${placeholders(ids)}) and deleted_at is null`, [now, now, ...ids]);
    });
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

  /** Restores `columns` on one row, re-inserting it from the snapshot if it has left the device (see restoreRow). */
  private restore(tx: Pick<Tx, "execute" | "getOptional">, before: Snapshot, id: string, columns: readonly string[], at: string): Promise<void> {
    return restoreRow(tx, "tasks", { ...before, id }, columns, at);
  }

  private remember(id: string, before: Snapshot | null, columns: readonly string[], label: string, toast: boolean, released: readonly BlockRow[] = [], announce?: string): void {
    if (!this.history || !before) return;
    const title = quoted(before.title);
    this.history.record({
      label: label.includes("{title}") ? label.replace("{title}", title) : `${label} ${title}`,
      toast,
      ...(announce ? { announce: announce.replace("{title}", title) } : {}),
      // One transaction: sync takes a done or deleted row off the device a moment after it uploads, and
      // that must not land between restore's presence check and its write (the write would hit nothing).
      undo: () =>
        this.db.writeTransaction(async (tx) => {
          const at = new Date().toISOString();
          await this.restore(tx, before, id, columns, at);
          if (released.length > 0) await reviveBlocks(tx, released, at);
        }),
    });
  }

  /**
   * A task that leaves a day lets go of the time it held there: its blocks that have not started and are not
   * locked are soft-deleted, unless they already sit on `keepOn`, the task's new day (null: no day at all). The
   * walkthrough found a task moved to tomorrow still holding today's block, counted in today's capacity and
   * pushed to the calendar. Started blocks stay (they happened); locked ones stay (locking means "keep this
   * here"). Returns what was released, so the undo can bring it back.
   */
  private releaseBlocks(ids: readonly string[], keepOn: LocalDate | null): Promise<BlockRow[]> {
    return releaseBlocks(this.db, ids, keepOn);
  }

  /**
   * Series edits on a repeating task — just this once, change the rule, skip this occurrence, pause and resume
   * (series-repo.ts). They load with the recurrence engine (rrule) the first time one is used, never in a shell.
   */
  async series(): Promise<import("./series-repo").SeriesRepo> {
    const { SeriesRepo } = await import("./series-repo");
    return new SeriesRepo(this.db, this.history);
  }

  private async snapshotMany(ids: readonly string[], columns: readonly string[]): Promise<RowSnapshot[]> {
    if (!this.history || columns.length === 0) return [];
    return this.db.getAll<RowSnapshot>(`select * from tasks where id in (${placeholders(ids)})`, [...ids]);
  }

  /** One undo entry for a batch: "Moved 4 tasks to tomorrow" (or the title when it is one). */
  private rememberMany(before: readonly RowSnapshot[], columns: readonly string[], label: string, toast: boolean, released: readonly BlockRow[] = []): void {
    if (!this.history || before.length === 0) return;
    const what = before.length === 1 ? quoted(before[0].title) : `${before.length} tasks`;
    this.history.record({
      label: label.includes("{title}") ? label.replace("{title}", what) : `${label} ${what}`,
      toast,
      undo: () =>
        this.db.writeTransaction(async (tx) => {
          const at = new Date().toISOString();
          for (const row of before) await this.restore(tx, row, row.id, columns, at);
          if (released.length > 0) await reviveBlocks(tx, released, at);
        }),
    });
  }

  /**
   * Writes exactly the columns in the patch (per-column last-writer-wins,
   * §4.3). Giving an inbox or Someday task a day makes it active; a project,
   * a deadline or a start date makes an inbox task active too; giving a
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
    const released = "doDate" in patch ? await this.releaseBlocks([id], patch.doDate ?? null) : [];
    this.remember(id, before, touched, note ?? "Changed", Boolean(note), released);
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
    const released = "doDate" in patch ? await this.releaseBlocks(ids, patch.doDate ?? null) : [];
    this.rememberMany(before, touched, note ?? "Changed", Boolean(note), released);
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
   * SYSTEM_DESIGN.md §5.2 "Completion": the row rolls forward to its next occurrence (recurring-completion.ts).
   * It and the recurrence engine (rrule) stay out of the app shell: they load the first time a repeat is completed.
   */
  private async completeRecurring(task: RecurringRow, before: RowSnapshot): Promise<void> {
    const { completeRecurring } = await import("./recurring-completion");
    await completeRecurring(this.db, this.history, task, before, await this.localToday());
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

  /**
   * Un-completing restores the previous state (PRODUCT_SPEC.md §7 rule 2). The row does not keep the state it
   * had before it was done, so it is read from what the task carries, by the rule that put it there (§5.1
   * rule 5): no project and no date at all is the Inbox, anything else is active. The do date stays, so a
   * past one lands the task in Carried over.
   */
  async reopen(id: string): Promise<void> {
    const cols = ["state", "completed_at"];
    const before = await this.snapshot(id, cols);
    await this.db.execute(`update tasks set state = ${REOPENED_STATE}, completed_at = null, updated_at = ? where id = ?`, [new Date().toISOString(), id]);
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
    const released = await this.releaseBlocks([id], doDate);
    this.remember(id, before, cols, doDate ? "Moved" : "Unscheduled", true, released);
  }

  /** Files the task under a heading of its project (null: under none). */
  async setHeading(id: string, headingId: string | null): Promise<void> {
    const cols = ["heading_id"];
    const before = await this.snapshot(id, cols);
    await this.db.execute(`update tasks set heading_id = ?, updated_at = ? where id = ?`, [headingId, new Date().toISOString(), id]);
    await this.rememberHeadingMove(id, before, cols, headingId);
  }

  /** A new place in its day's list: a silent undo entry (⌘Z still answers). */
  async setDayOrder(id: string, daySortKey: string): Promise<void> {
    const cols = ["day_sort_key"];
    const before = await this.snapshot(id, cols);
    await this.db.execute(`update tasks set day_sort_key = ?, updated_at = ? where id = ?`, [daySortKey, new Date().toISOString(), id]);
    this.remember(id, before, cols, "Reordered", false, [], before ? await this.placeWords(id, "day") : undefined);
  }

  /** Position in the project list; with `headingId`, also the section it moved into. */
  async setOrder(id: string, sortKey: string, headingId?: string | null): Promise<void> {
    const cols = headingId === undefined ? ["sort_key"] : ["sort_key", "heading_id"];
    const before = await this.snapshot(id, cols);
    if (headingId === undefined) await this.db.execute(`update tasks set sort_key = ?, updated_at = ? where id = ?`, [sortKey, new Date().toISOString(), id]);
    else await this.db.execute(`update tasks set sort_key = ?, heading_id = ?, updated_at = ? where id = ?`, [sortKey, headingId, new Date().toISOString(), id]);
    if (headingId === undefined) this.remember(id, before, cols, "Reordered", false, [], before ? await this.placeWords(id, "list") : undefined);
    else await this.rememberHeadingMove(id, before, cols, headingId);
  }

  /**
   * A reorder said in words for the live region (SYSTEM_DESIGN.md §11.5): "Moved {title} after “Call Dana”", or "to
   * the top", by the open task now just above it in the same list — its day (and evening or not) or its project,
   * heading and area.
   */
  private async placeWords(id: string, list: "day" | "list"): Promise<string> {
    const same =
      list === "day"
        ? `t.do_date is me.do_date and t.evening is me.evening and t.day_sort_key < me.day_sort_key order by t.day_sort_key desc`
        : `t.project_id is me.project_id and t.heading_id is me.heading_id and t.area_id is me.area_id and t.state = me.state and t.sort_key < me.sort_key order by t.sort_key desc`;
    const above = await this.db.getOptional<{ title: string | null }>(
      `select t.title from tasks t, tasks me where me.id = ? and t.id <> me.id and t.deleted_at is null and t.state in ('inbox', 'active', 'someday') and ${same} limit 1`,
      [id],
    );
    return above ? `Moved {title} after ${quoted(above.title)}` : "Moved {title} to the top";
  }

  /**
   * Puts the task on `day` at `daySortKey` in one statement (a drop into a day's list). Like reschedule, a
   * task that leaves a day lets go of the time it held there. A move to another day, or into or out of the
   * evening, gets an undo toast ("Moved “X” to Tue 6 Oct"); a new place in the same list is a silent entry.
   */
  async placeInDay(id: string, day: LocalDate, daySortKey: string, evening = false): Promise<void> {
    const cols = ["do_date", "day_sort_key", "evening", "state"];
    const before = await this.snapshot(id, cols);
    await this.db.execute(`update tasks set do_date = ?, day_sort_key = ?, evening = ?, state = case when state in ('inbox', 'someday') then 'active' else state end, updated_at = ? where id = ?`, [
      day.toString(),
      daySortKey,
      evening ? 1 : 0,
      new Date().toISOString(),
      id,
    ]);
    const released = await this.releaseBlocks([id], day);
    if (!before) return;
    if (text(before.do_date) !== day.toString()) this.remember(id, before, cols, `Moved {title} to ${await this.dayWords(day)}`, true, released);
    else if (Boolean(before.evening) !== evening) this.remember(id, before, cols, evening ? "Moved {title} to the evening" : "Moved {title} out of the evening", true, released);
    else this.remember(id, before, cols, "Reordered", false, released, await this.placeWords(id, "day"));
  }

  /** A drag into another section reads "Moved “X” to Budget" with a toast; within the same one it is a silent reorder. */
  private async rememberHeadingMove(id: string, before: Snapshot | null, columns: readonly string[], headingId: string | null): Promise<void> {
    if (!before) return;
    const from = text(before.heading_id);
    if (from === headingId) return this.remember(id, before, columns, "Reordered", false, [], await this.placeWords(id, "list"));
    const titleOf = async (hid: string | null) => (hid ? ((await this.db.getOptional<{ title: string | null }>(`select title from headings where id = ?`, [hid]))?.title ?? null) : null);
    const label = headingId ? `Moved {title} to ${(await titleOf(headingId)) ?? "another heading"}` : `Moved {title} out of ${(await titleOf(from)) ?? "its heading"}`;
    this.remember(id, before, columns, label, true);
  }

  /** The person's day now (their zone, their rollover hour). */
  private localToday(): Promise<LocalDate> {
    return localToday(this.db);
  }

  /** A day as an undo toast names it: "today", "tomorrow", else "Tue 6 Oct". */
  private async dayWords(day: LocalDate): Promise<string> {
    const today = await this.localToday();
    const days = day.since(today, { largestUnit: "days" }).days;
    return days === 0 ? "today" : days === 1 ? "tomorrow" : formatDay(day, { today });
  }

  /**
   * Convert task → project ("Break it down", PRODUCT_SPEC.md §6, §8.3.3): one transaction and one undo entry. The
   * conversion lives in its own module, loaded on the click that asks for it, so no shell carries it.
   */
  async convertToProject(id: string, onUndone?: (projectId: string) => void): Promise<{ projectId: string; taskIds: string[] } | null> {
    const { convertTaskToProject } = await import("./convert");
    return convertTaskToProject(this.db, this.history, id, onUndone);
  }

  /**
   * Records that the three-carry ask was shown for these tasks (PRODUCT_SPEC.md §8.3.4: once per task per seven
   * days, two a day). Bookkeeping, not an edit: no undo entry, and the server does not count it as a touch.
   */
  async markAsked(ids: readonly string[], at: string = new Date().toISOString()): Promise<void> {
    if (ids.length === 0) return;
    await this.db.execute(`update tasks set carry_asked_at = ?, updated_at = ? where id in (${placeholders(ids)})`, [at, at, ...ids]);
  }

  /** `note` names the change for a toast ("Brought back {title}"); without one, bringing a task back is a silent undo entry. */
  async setState(id: string, state: TaskState, note?: string): Promise<void> {
    const cols = ["state", "do_date"];
    const before = await this.snapshot(id, cols);
    await this.db.execute(`update tasks set ${STATE_SETS} where id = ?`, [state, state, state, new Date().toISOString(), id]);
    // Parked, dropped or archived, the task has no day: the time it held goes back to the day.
    const released = state === "active" ? [] : await this.releaseBlocks([id], null);
    this.remember(id, before, cols, note ?? STATE_LABELS[state], Boolean(note) || state !== "active", released);
  }

  async setStateMany(ids: readonly string[], state: TaskState, note?: string): Promise<void> {
    if (ids.length === 0) return;
    const cols = ["state", "do_date"];
    const before = await this.snapshotMany(ids, cols);
    await this.db.execute(`update tasks set ${STATE_SETS} where id in (${placeholders(ids)})`, [state, state, state, new Date().toISOString(), ...ids]);
    const released = state === "active" ? [] : await this.releaseBlocks(ids, null);
    this.rememberMany(before, cols, note ?? STATE_LABELS[state], Boolean(note) || state !== "active", released);
  }
}

/** The person's day now, in their zone and by their rollover hour, as this device's settings row has them. */
export async function localToday(db: LocalDatabase): Promise<LocalDate> {
  const settings = await db.getOptional<{ timezone: string | null; day_rollover_hour: number | null }>(`select timezone, day_rollover_hour from user_settings limit 1`);
  return todayFor({ timezone: settings?.timezone ?? "UTC", dayRolloverHour: settings?.day_rollover_hour ?? 4 }, Temporal.Now.instant());
}

/**
 * A task that leaves a day lets go of the time it held there (TaskRepo.releaseBlocks above): its unlocked blocks
 * that have not started and are not on `keepOn` are soft-deleted. Returns them, for the undo to bring back.
 */
export async function releaseBlocks(db: LocalDatabase, ids: readonly string[], keepOn: LocalDate | null): Promise<BlockRow[]> {
  if (ids.length === 0) return [];
  const rows = await db.getAll<BlockRow>(`select * from time_blocks where task_id in (${placeholders(ids)}) and deleted_at is null and locked = 0`, [...ids]);
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const now = Temporal.Now.instant();
  const zone = keepOn ? ((await db.getOptional<{ timezone: string | null }>(`select timezone from user_settings limit 1`))?.timezone ?? "UTC") : "UTC";
  const release = rows.filter((b) => {
    if (typeof b.start_at !== "string") return false;
    let start: Temporal.Instant;
    try {
      start = Temporal.Instant.from(normaliseTimestamp(b.start_at));
    } catch {
      return false;
    }
    if (Temporal.Instant.compare(start, now) <= 0) return false;
    return !keepOn || !start.toZonedDateTimeISO(zone).toPlainDate().equals(keepOn);
  });
  if (release.length === 0) return [];
  const at = new Date().toISOString();
  await db.execute(`update time_blocks set deleted_at = ?, updated_at = ? where id in (${placeholders(release.map((b) => b.id))})`, [at, at, ...release.map((b) => b.id)]);
  return release;
}

type Snapshot = Record<string, string | number | null>;
type RowSnapshot = Snapshot & { id: string };

const text = (v: string | number | null | undefined): string | null => (v == null ? null : String(v));

/** The recurrence fields of a row that repeats (a rule and a mode), else null. */
function recurringOf(row: RowSnapshot): RecurringRow | null {
  if (!row.recurrence_rule || !row.recurrence_mode) return null;
  return {
    id: row.id,
    space_id: String(row.space_id ?? ""),
    do_date: text(row.do_date),
    deadline: text(row.deadline),
    recurrence_rule: String(row.recurrence_rule),
    recurrence_mode: String(row.recurrence_mode),
    recurrence_series_id: text(row.recurrence_series_id),
    recurrence_paused_until: text(row.recurrence_paused_until),
    actual_min: typeof row.actual_min === "number" ? row.actual_min : null,
  };
}

const STATE_SETS = `state = ?, do_date = case when ? in ('someday','archived') then null else do_date end, carry_count = case when ? in ('someday','archived','dropped') then 0 else carry_count end, updated_at = ?`;
/** The state a reopened task goes back to: the Inbox when nothing files or dates it (§5.1 rule 5), else active. */
const REOPENED_STATE = `case when project_id is null and area_id is null and do_date is null and deadline is null and start_date is null then 'inbox' else 'active' end`;
const STATE_LABELS: Record<TaskState, string> = { dropped: "Dropped", someday: "Moved {title} to Someday", archived: "Archived", active: "Brought back" };

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
  // A task is filed in a project or in an area, never both (DECISIONS.md, M1 gap rulings): an area clears the
  // project and its heading, a project (or "No project") clears the area. The server's tasks_filing trigger agrees.
  if (patch.areaId) {
    set("area_id", patch.areaId);
    set("project_id", null);
    set("heading_id", null);
  } else if ("projectId" in patch) {
    set("project_id", patch.projectId ?? null);
    set("area_id", null);
    // A heading belongs to its project: a task moved to another project (a sidebar drop, the picker, the bulk
    // bar) leaves its old heading behind, and one re-filed in the same project keeps it. SQLite reads the old
    // project_id on the right-hand side.
    sets.push(`heading_id = case when project_id is ? then heading_id else null end`);
    args.push(patch.projectId ?? null);
  } else if ("areaId" in patch) {
    set("area_id", null);
  }
  if ("recurrenceRule" in patch) {
    set("recurrence_rule", patch.recurrenceRule ?? null);
    set("recurrence_mode", patch.recurrenceRule ? (patch.recurrenceMode ?? "fixed") : null);
    sets.push(patch.recurrenceRule ? `recurrence_series_id = coalesce(recurrence_series_id, id)` : `recurrence_series_id = null`);
  } else if ("recurrenceMode" in patch) {
    set("recurrence_mode", patch.recurrenceMode ?? null);
  }
  // A do date has already brought an Inbox or Someday task in above. Without one, a project, a deadline or a
  // start date takes a task out of the Inbox (PRODUCT_SPEC.md §5.1 rule 5, §7 "triage — give it a date or a
  // project"); a Someday task stays parked until it is given a day (§7 "schedule it").
  if (!patch.doDate && filesOrDates(patch)) sets.push(`state = case when state = 'inbox' then 'active' else state end`);
  return { sets, args };
}

/** Whether the patch files the task (a project or an area) or gives it a deadline or a start date: enough to leave the Inbox. */
const filesOrDates = (patch: TaskPatch): boolean => Boolean(patch.projectId || patch.areaId || patch.deadline || patch.startDate);

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
  projectId: ["project_id", "area_id", "heading_id"],
  areaId: ["area_id", "project_id", "heading_id"],
  recurrenceRule: ["recurrence_rule", "recurrence_mode", "recurrence_series_id"],
  recurrenceMode: ["recurrence_mode"],
};

/** The columns a patch writes, for the snapshot that undoes it (with `state` when the patch can take a task out of the Inbox). */
export function columnsTouched(patch: TaskPatch): string[] {
  const out = new Set<string>();
  for (const key of Object.keys(patch) as (keyof TaskPatch)[]) for (const c of PATCH_COLUMNS[key] ?? []) out.add(c);
  if (filesOrDates(patch)) out.add("state");
  return [...out];
}
