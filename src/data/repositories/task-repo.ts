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

type Tx = Parameters<Parameters<LocalDatabase["writeTransaction"]>[0]>[0];

export class TaskRepo {
  constructor(private readonly db: LocalDatabase) {}

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

  /**
   * Writes exactly the columns in the patch (per-column last-writer-wins,
   * §4.3). Giving an inbox or Someday task a day makes it active; giving a
   * task its first repeat rule makes it the head of its own series.
   */
  async update(id: string, patch: TaskPatch): Promise<void> {
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
    if (sets.length === 0) return;
    set("updated_at", new Date().toISOString());
    await this.db.execute(`update tasks set ${sets.join(", ")} where id = ?`, [...args, id]);
  }

  async complete(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(`update tasks set state = 'done', completed_at = ?, updated_at = ? where id = ?`, [now, now, id]);
  }

  async reopen(id: string): Promise<void> {
    await this.db.execute(`update tasks set state = 'active', completed_at = null, updated_at = ? where id = ?`, [new Date().toISOString(), id]);
  }

  async reschedule(id: string, doDate: LocalDate | null): Promise<void> {
    await this.db.execute(`update tasks set do_date = ?, do_time = case when ? is null then null else do_time end, state = 'active', updated_at = ? where id = ?`, [
      doDate?.toString() ?? null,
      doDate?.toString() ?? null,
      new Date().toISOString(),
      id,
    ]);
  }

  async setHeading(id: string, headingId: string | null): Promise<void> {
    await this.db.execute(`update tasks set heading_id = ?, updated_at = ? where id = ?`, [headingId, new Date().toISOString(), id]);
  }

  async setDayOrder(id: string, daySortKey: string): Promise<void> {
    await this.db.execute(`update tasks set day_sort_key = ?, updated_at = ? where id = ?`, [daySortKey, new Date().toISOString(), id]);
  }

  async setState(id: string, state: "someday" | "dropped" | "archived" | "active"): Promise<void> {
    await this.db.execute(`update tasks set state = ?, do_date = case when ? in ('someday','archived') then null else do_date end, carry_count = case when ? in ('someday','archived','dropped') then 0 else carry_count end, updated_at = ? where id = ?`, [
      state,
      state,
      state,
      new Date().toISOString(),
      id,
    ]);
  }
}
