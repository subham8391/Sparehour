// Task writes. Each call is one local transaction; PowerSync uploads it
// through the connector. Only the moved/changed columns are written, which
// is what makes per-column last-writer-wins work (§4.3).
import { keyBetween } from "@/core/ordering";
import type { TaskDraft } from "@/core/quickadd";
import type { LocalDate } from "@/core/time";
import type { LocalDatabase } from "../powersync";

export interface NewTaskContext {
  spaceId: string;
  /** Sort key of the last item in the target list, if any. */
  afterKey?: string | null;
}

export class TaskRepo {
  constructor(private readonly db: LocalDatabase) {}

  async create(draft: TaskDraft, ctx: NewTaskContext): Promise<string> {
    const id = crypto.randomUUID();
    const sortKey = keyBetween(ctx.afterKey ?? null, null);
    await this.db.execute(
      `insert into tasks (id, space_id, title, notes_md, state, priority, do_date, do_time, deadline, start_date,
                          evening, estimate_min, carry_count, last_touched_at, miss_policy, recurrence_rule,
                          recurrence_mode, recurrence_series_id, sort_key, day_sort_key, source, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 'quickadd', ?, ?)`,
      [
        id,
        ctx.spaceId,
        draft.title,
        draft.notes,
        draft.doDate ? "active" : "inbox",
        draft.priority,
        draft.doDate?.toString() ?? null,
        draft.doTime ? draft.doTime.toString({ smallestUnit: "minute" }) : null,
        draft.deadline?.toString() ?? null,
        draft.startDate?.toString() ?? null,
        draft.evening ? 1 : 0,
        draft.estimateMin,
        new Date().toISOString(),
        draft.recurrenceRule ? "skip" : "carry",
        draft.recurrenceRule,
        draft.recurrenceMode,
        draft.recurrenceRule ? id : null,
        sortKey,
        draft.doDate ? sortKey : null,
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );
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
