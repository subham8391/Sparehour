// Time-block writes (PRODUCT_SPEC.md §10.2). push_state is the server's
// column (the upload drops it): a new block lands as 'pending' there and is
// written to Google once a write calendar exists (SYSTEM_DESIGN.md §6.5);
// a moved or deleted block is re-queued by a trigger. Removing a block never
// touches the task.
import { Temporal, formatTime, instant, timeOf } from "@/core/time";
import { normaliseTimestamp } from "../mappers";
import type { LocalDatabase } from "../powersync";
import type { UndoRecorder } from "./undo";

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

type Tx = Parameters<Parameters<LocalDatabase["writeTransaction"]>[0]>[0];
export type BlockRow = Record<string, string | number | null> & { id: string };

/**
 * Brings soft-deleted blocks back for an undo. Sync takes a deleted block off
 * the device a moment after the deletion uploads (the stream carries live
 * blocks only), so a block that is gone is re-inserted from its snapshot, and
 * the explicit write after it carries `deleted_at = null`, which the sync layer
 * leaves out of an insert. It runs in the caller's transaction, so sync cannot
 * take a block away between the presence check and the write.
 */
export async function reviveBlocks(tx: Pick<Tx, "execute" | "getOptional">, rows: readonly BlockRow[], at: string): Promise<void> {
  for (const before of rows) {
    const present = await tx.getOptional<{ id: string }>(`select id from time_blocks where id = ?`, [before.id]);
    if (!present) {
      // Inserted still deleted and then undeleted: an update uploads only the columns it changes, so the clearing
      // has to be a change to reach the server, where the block is deleted (see restoreRow in undo.ts).
      const row: Record<string, string | number | null> = { ...before, deleted_at: at, updated_at: at };
      const cols = Object.keys(row);
      await tx.execute(`insert into time_blocks (${cols.join(", ")}) values (${cols.map(() => "?").join(", ")})`, cols.map((c) => row[c] ?? null));
    }
    await tx.execute(`update time_blocks set deleted_at = null, updated_at = ? where id = ?`, [at, before.id]);
  }
}

/** Whether two stored timestamps ("2026-09-14 08:00:00+00", "2026-09-14T08:00:00Z") are the same moment. */
function sameInstant(a: string, b: string): boolean {
  try {
    return Temporal.Instant.compare(instant(normaliseTimestamp(a)), instant(normaliseTimestamp(b))) === 0;
  } catch {
    return a === b;
  }
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
      // A block of your own (no task) is "a block" until it is named.
      label: block.taskId === null ? "Added a block" : block.title ? `Blocked “${block.title}”` : "Blocked time",
      toast: true,
      rows: { time_blocks: [id] },
      announce: `${block.title ? `Blocked “${block.title}”` : "Blocked time"} ${await this.span(block.startAt, block.endAt)}`.trim(),
      undo: () => this.db.execute(`update time_blocks set deleted_at = ?, updated_at = ? where id = ?`, [new Date().toISOString(), new Date().toISOString(), id]).then(() => undefined),
    });
    return id;
  }

  async move(id: string, startAt: string, endAt: string): Promise<void> {
    const before = this.history ? await this.db.getOptional<{ start_at: string; end_at: string; title: string | null }>(`select start_at, end_at, title from time_blocks where id = ?`, [id]) : null;
    await this.db.execute(`update time_blocks set start_at = ?, end_at = ?, updated_at = ? where id = ?`, [startAt, endAt, new Date().toISOString(), id]);
    if (before) {
      const what = before.title ? `“${before.title}”` : "a block";
      // A drag, a resize or a keyboard move is silent on screen and said in words (SYSTEM_DESIGN.md §11.5).
      const resized = sameInstant(before.start_at, startAt);
      this.history?.record({
        label: `Moved ${what}`,
        toast: false,
        rows: { time_blocks: [id] },
        announce: `${resized ? "Resized" : "Moved"} ${what} to ${(await this.span(startAt, endAt)) || "its new time"}`,
        undo: () => this.db.execute(`update time_blocks set start_at = ?, end_at = ?, updated_at = ? where id = ?`, [before.start_at, before.end_at, new Date().toISOString(), id]).then(() => undefined),
      });
    }
  }

  /** "14:30–15:15" on the person's clock (their settings' zone), for the words a move is announced with. */
  private async span(startAt: string, endAt: string): Promise<string> {
    try {
      const zone = (await this.db.getOptional<{ timezone: string | null }>(`select timezone from user_settings limit 1`))?.timezone || Temporal.Now.timeZoneId();
      const at = (iso: string) => formatTime(timeOf(instant(normaliseTimestamp(iso)), zone));
      return `${at(startAt)}–${at(endAt)}`;
    } catch {
      return "";
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
    // Whole rows, not ids: by the time someone undoes, sync may have taken the replaced blocks off the device.
    let replaced: BlockRow[] = [];
    await this.db.writeTransaction(async (tx) => {
      if (plan.replaces.length > 0) {
        const marks = plan.replaces.map(() => "?").join(", ");
        replaced = await tx.getAll<BlockRow>(`select * from time_blocks where id in (${marks}) and deleted_at is null and locked = 0 and source = 'plan'`, [...plan.replaces]);
        if (replaced.length > 0) await tx.execute(`update time_blocks set deleted_at = ?, updated_at = ? where id in (${replaced.map(() => "?").join(", ")})`, [stamp, stamp, ...replaced.map((r) => r.id)]);
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
      rows: { time_blocks: [...ids, ...replaced.map((r) => r.id)] },
      undo: async () => {
        const at = new Date().toISOString();
        await this.db.writeTransaction(async (tx) => {
          if (ids.length > 0) await tx.execute(`update time_blocks set deleted_at = ?, updated_at = ? where id in (${ids.map(() => "?").join(", ")})`, [at, at, ...ids]);
          await reviveBlocks(tx, replaced, at);
        });
        opts.afterUndo?.();
      },
    });
    return ids;
  }

  async setLocked(id: string, locked: boolean): Promise<void> {
    await this.db.execute(`update time_blocks set locked = ?, updated_at = ? where id = ?`, [locked ? 1 : 0, new Date().toISOString(), id]);
    this.history?.record({
      label: locked ? "Locked the block" : "Unlocked the block",
      toast: false,
      rows: { time_blocks: [id] },
      undo: () => this.db.execute(`update time_blocks set locked = ?, updated_at = ? where id = ?`, [locked ? 0 : 1, new Date().toISOString(), id]).then(() => undefined),
    });
  }

  /**
   * Renames a block (SCREENS.md §2.6 "Double-click renames"). An empty title clears it, so a task's block reads its
   * task's title again and an ad-hoc block reads "Block".
   */
  async rename(id: string, title: string | null): Promise<void> {
    const next = title?.trim() || null;
    const before = await this.db.getOptional<{ title: string | null }>(`select title from time_blocks where id = ?`, [id]);
    if (before && (before.title ?? null) === next) return;
    await this.db.execute(`update time_blocks set title = ?, updated_at = ? where id = ?`, [next, new Date().toISOString(), id]);
    if (before) {
      this.history?.record({
        label: next ? `Renamed the block to “${next}”` : "Cleared the block’s name",
        toast: true,
        rows: { time_blocks: [id] },
        undo: () => this.db.execute(`update time_blocks set title = ?, updated_at = ? where id = ?`, [before.title ?? null, new Date().toISOString(), id]).then(() => undefined),
      });
    }
  }

  /**
   * A copy of a block at another time (SCREENS.md §2.6 "Alt+drag duplicates a block"): same task and title,
   * unlocked, written as a manual block and pushed like any other. One undo entry takes the copy away.
   */
  async duplicate(id: string, startAt: string, endAt: string): Promise<string | null> {
    const from = await this.db.getOptional<{ space_id: string; user_id: string; task_id: string | null; title: string | null }>(
      `select space_id, user_id, task_id, title from time_blocks where id = ? and deleted_at is null`,
      [id],
    );
    if (!from) return null;
    const copy = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.execute(
      `insert into time_blocks (id, space_id, user_id, task_id, title, start_at, end_at, locked, source, push_state, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, 0, 'manual', 'local', ?, ?)`,
      [copy, from.space_id, from.user_id, from.task_id, from.title, startAt, endAt, now, now],
    );
    this.history?.record({
      label: from.title ? `Copied “${from.title}”` : "Copied the block",
      toast: true,
      rows: { time_blocks: [copy] },
      undo: () => this.db.execute(`update time_blocks set deleted_at = ?, updated_at = ? where id = ?`, [new Date().toISOString(), new Date().toISOString(), copy]).then(() => undefined),
    });
    return copy;
  }

  /** Soft-deletes the block; the task stays exactly where it was. */
  async remove(id: string): Promise<void> {
    const before = this.history ? await this.db.getOptional<BlockRow>(`select * from time_blocks where id = ?`, [id]) : null;
    const now = new Date().toISOString();
    await this.db.execute(`update time_blocks set deleted_at = ?, updated_at = ? where id = ?`, [now, now, id]);
    if (before) {
      this.history?.record({
        label: `Removed the block${before.title ? ` for “${before.title}”` : ""}`,
        toast: true,
        rows: { time_blocks: [id] },
        undo: () => this.db.writeTransaction((tx) => reviveBlocks(tx, [before], new Date().toISOString())),
      });
    }
  }
}
