// Time-block writes (PRODUCT_SPEC.md §10.2). push_state is the server's
// column (the upload drops it): a new block lands as 'pending' there and is
// written to Google once a write calendar exists (SYSTEM_DESIGN.md §6.5);
// a moved or deleted block is re-queued by a trigger. Removing a block never
// touches the task.
import type { LocalDatabase } from "../powersync";
import type { UndoRecorder } from "./task-repo";

export interface NewBlock {
  spaceId: string;
  userId: string;
  taskId: string | null;
  title: string | null;
  startAt: string; // ISO instant
  endAt: string;
}

/** What Approve writes: the chosen blocks, and the plan's earlier blocks they replace. */
export interface ApprovedPlan {
  spaceId: string;
  userId: string;
  blocks: { taskId: string; title: string; startAt: string; endAt: string }[];
  replaces: readonly string[];
}

export class BlockRepo {
  constructor(
    private readonly db: LocalDatabase,
    private readonly history?: UndoRecorder,
  ) {}

  async create(block: NewBlock): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.execute(
      `insert into time_blocks (id, space_id, user_id, task_id, title, start_at, end_at, locked, source, push_state, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, 0, 'manual', 'local', ?, ?)`,
      [id, block.spaceId, block.userId, block.taskId, block.title, block.startAt, block.endAt, now, now],
    );
    this.history?.record({
      label: block.title ? `Blocked “${block.title}”` : "Blocked time",
      toast: true,
      undo: () => this.db.execute(`update time_blocks set deleted_at = ?, updated_at = ? where id = ?`, [new Date().toISOString(), new Date().toISOString(), id]).then(() => undefined),
    });
    return id;
  }

  async move(id: string, startAt: string, endAt: string): Promise<void> {
    const before = this.history ? await this.db.getOptional<{ start_at: string; end_at: string; title: string | null }>(`select start_at, end_at, title from time_blocks where id = ?`, [id]) : null;
    await this.db.execute(`update time_blocks set start_at = ?, end_at = ?, updated_at = ? where id = ?`, [startAt, endAt, new Date().toISOString(), id]);
    if (before) {
      this.history?.record({
        label: `Moved ${before.title ? `“${before.title}”` : "a block"}`,
        toast: false,
        undo: () => this.db.execute(`update time_blocks set start_at = ?, end_at = ?, updated_at = ? where id = ?`, [before.start_at, before.end_at, new Date().toISOString(), id]).then(() => undefined),
      });
    }
  }

  /**
   * Plan my day's Approve (SYSTEM_DESIGN.md §5.5): every chosen block in one
   * transaction with source 'plan', and the plan's own earlier blocks it
   * replaces soft-deleted in the same breath. Only blocks that are still
   * unlocked plan blocks are replaced, so a block locked since the preview
   * opened stays. One undo entry takes the whole batch back.
   */
  async approvePlan(plan: ApprovedPlan, opts: { afterUndo?: () => void } = {}): Promise<string[]> {
    const ids = plan.blocks.map(() => crypto.randomUUID());
    const stamp = new Date().toISOString();
    let replaced: string[] = [];
    await this.db.writeTransaction(async (tx) => {
      if (plan.replaces.length > 0) {
        const marks = plan.replaces.map(() => "?").join(", ");
        const rows = await tx.getAll<{ id: string }>(`select id from time_blocks where id in (${marks}) and deleted_at is null and locked = 0 and source = 'plan'`, [...plan.replaces]);
        replaced = rows.map((r) => r.id);
        if (replaced.length > 0) await tx.execute(`update time_blocks set deleted_at = ?, updated_at = ? where id in (${replaced.map(() => "?").join(", ")})`, [stamp, stamp, ...replaced]);
      }
      for (const [i, b] of plan.blocks.entries()) {
        await tx.execute(
          `insert into time_blocks (id, space_id, user_id, task_id, title, start_at, end_at, locked, source, push_state, created_at, updated_at)
           values (?, ?, ?, ?, ?, ?, ?, 0, 'plan', 'local', ?, ?)`,
          [ids[i], plan.spaceId, plan.userId, b.taskId, b.title, b.startAt, b.endAt, stamp, stamp],
        );
      }
    });
    const n = ids.length;
    this.history?.record({
      label: `Planned ${n} ${n === 1 ? "block" : "blocks"}`,
      toast: true,
      undo: async () => {
        const at = new Date().toISOString();
        await this.db.writeTransaction(async (tx) => {
          if (ids.length > 0) await tx.execute(`update time_blocks set deleted_at = ?, updated_at = ? where id in (${ids.map(() => "?").join(", ")})`, [at, at, ...ids]);
          if (replaced.length > 0) await tx.execute(`update time_blocks set deleted_at = null, updated_at = ? where id in (${replaced.map(() => "?").join(", ")})`, [at, ...replaced]);
        });
        opts.afterUndo?.();
      },
    });
    return ids;
  }

  async setLocked(id: string, locked: boolean): Promise<void> {
    await this.db.execute(`update time_blocks set locked = ?, updated_at = ? where id = ?`, [locked ? 1 : 0, new Date().toISOString(), id]);
  }

  /** Soft-deletes the block; the task stays exactly where it was. */
  async remove(id: string): Promise<void> {
    const before = this.history ? await this.db.getOptional<{ title: string | null }>(`select title from time_blocks where id = ?`, [id]) : null;
    const now = new Date().toISOString();
    await this.db.execute(`update time_blocks set deleted_at = ?, updated_at = ? where id = ?`, [now, now, id]);
    if (before) {
      this.history?.record({
        label: `Removed the block${before.title ? ` for “${before.title}”` : ""}`,
        toast: true,
        undo: () => this.db.execute(`update time_blocks set deleted_at = null, updated_at = ? where id = ?`, [new Date().toISOString(), id]).then(() => undefined),
      });
    }
  }
}
