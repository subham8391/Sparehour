// Time-block writes (PRODUCT_SPEC.md §10.2). Blocks stay local
// (push_state 'local') until a write calendar exists (P7b); removing a block
// never touches the task.
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
