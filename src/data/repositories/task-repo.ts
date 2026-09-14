// Task writes. Each call is one local transaction; PowerSync uploads it
// through the connector. Only the moved/changed columns are written, which
// is what makes per-column last-writer-wins work (§4.3).
import { keyBetween } from "@/core/ordering";
import type { TaskDraft } from "@/core/quickadd";
import type { LocalDate } from "@/core/time";
import type { LocalDatabase } from "../powersync";

export interface NewTaskContext {
  spaceId: string;
  /** The project the task belongs to; null for the inbox / no project. */
  projectId?: string | null;
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
        `insert into tasks (id, space_id, project_id, title, notes_md, state, priority, do_date, do_time, deadline, start_date,
                            evening, estimate_min, carry_count, last_touched_at, miss_policy, recurrence_rule,
                            recurrence_mode, recurrence_series_id, sort_key, day_sort_key, source, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 'quickadd', ?, ?)`,
        [
          id,
          ctx.spaceId,
          projectId,
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
