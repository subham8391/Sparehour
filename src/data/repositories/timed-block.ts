// A task with a day and a time holds that time on the day (DECISIONS.md, amendment 2026-11-16): "Workout 8am ~2h"
// is on the timeline from 08:00 to 10:00 without Block being pressed, so the day's number counts it where it is
// and its reminder comes when the block starts. The block is an ordinary one (it can be moved, locked, removed,
// and goes to the calendar like any other); these are the rules that make it and keep it in step:
//
// - Made when the task has a day and a time, is still open, and has no block on that day. Its length is the
//   estimate, or the account's default where there is none. A time that has wholly passed gets no block.
// - The task's time (or its length) changes: the block that was made for the old time moves with it, unless it
//   was locked or has started. The time is taken off: that block goes.
// - A block the person put somewhere else by hand is theirs: it is left alone, and no second one is made beside it.
// - The task's day changes: the repository has already let go of the blocks it held on the old day
//   (releaseBlocks); the new day gets its block here.
//
// Loaded by TaskRepo the first time a write touches a day or a time, never in a shell.
import { startOf, timedStep } from "@/core/blocking/timed";
import { Temporal } from "@/core/time";
import { normaliseTimestamp } from "../mappers";
import type { LocalDatabase } from "../powersync";
import { reviveBlocks, type BlockRow } from "./block-revive";
import { placeholders, type Tx } from "./undo";

/** A task's day, time and length as they were before a write. */
export interface TimeOf {
  id: string;
  do_date: string | null;
  do_time: string | null;
  estimate_min: number | null;
}

/** What keeping the blocks in step did, and how to take exactly that back. */
export interface TimedChange {
  /** Every block made, moved or removed, for the undo entry's rows. */
  ids: string[];
  undo: (tx: Pick<Tx, "execute" | "getOptional">, at: string) => Promise<void>;
}

type TaskRow = TimeOf & { space_id: string | null; title: string | null; state: string | null; deleted_at: string | null };

const instantOf = (stamp: string | number | null): Temporal.Instant | null => {
  if (typeof stamp !== "string") return null;
  try {
    return Temporal.Instant.from(normaliseTimestamp(stamp));
  } catch {
    return null;
  }
};

/**
 * Brings the blocks of `ids` in step with the tasks as they are now. `was` is how they were before the write that
 * has just been made (null for a task that is new): it tells the block made for the old time from one placed by hand.
 */
export async function keepTimedBlocks(db: LocalDatabase, ids: readonly string[], was: readonly TimeOf[] | null): Promise<TimedChange | null> {
  if (ids.length === 0) return null;
  const made: string[] = [];
  const moved: { id: string; start_at: string; end_at: string }[] = [];
  const removed: BlockRow[] = [];

  await db.writeTransaction(async (tx) => {
    const settings = await tx.getOptional<{ timezone: string | null; default_estimate_min: number | null }>(`select timezone, default_estimate_min from user_settings limit 1`);
    const user = await tx.getOptional<{ id: string }>(`select id from users limit 1`);
    const zone = settings?.timezone ?? "UTC";
    const now = Temporal.Now.instant();
    const stamp = new Date().toISOString();

    for (const id of ids) {
      const task = await tx.getOptional<TaskRow>(`select id, space_id, title, state, do_date, do_time, estimate_min, deleted_at from tasks where id = ?`, [id]);
      if (!task) continue;
      const blocks = await tx.getAll<BlockRow>(`select * from time_blocks where task_id = ? and deleted_at is null`, [id]);
      const live = Array.isArray(blocks) ? blocks : [];
      const before = was?.find((w) => w.id === id) ?? null;
      const open = !task.deleted_at && (task.state === "active" || task.state === "inbox");
      const step = timedStep({
        start: open ? startOf(task.do_date, task.do_time, zone) : null,
        oldStart: before ? startOf(before.do_date, before.do_time, zone) : null,
        estimateMin: task.estimate_min,
        defaultEstimateMin: settings?.default_estimate_min ?? 30,
        blocks: live.map((b) => ({ id: b.id, start: instantOf(b.start_at), end: instantOf(b.end_at), locked: Boolean(b.locked) })),
        zone,
        now,
      });
      if (step.kind === "none") continue;
      if (step.kind === "remove") {
        await tx.execute(`update time_blocks set deleted_at = ?, updated_at = ? where id = ?`, [stamp, stamp, step.id]);
        removed.push(live.find((b) => b.id === step.id) as BlockRow);
        continue;
      }
      const { start, end } = step;
      if (step.kind === "move") {
        const own = live.find((b) => b.id === step.id) as BlockRow;
        await tx.execute(`update time_blocks set start_at = ?, end_at = ?, updated_at = ? where id = ?`, [start.toString(), end.toString(), stamp, own.id]);
        moved.push({ id: own.id, start_at: String(own.start_at), end_at: String(own.end_at) });
        continue;
      }
      if (!user || !task.space_id) continue;
      const blockId = crypto.randomUUID();
      await tx.execute(
        `insert into time_blocks (id, space_id, user_id, task_id, title, start_at, end_at, locked, source, push_state, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, 0, 'manual', 'local', ?, ?)`,
        [blockId, task.space_id, user.id, id, task.title, start.toString(), end.toString(), stamp, stamp],
      );
      made.push(blockId);
    }
  });

  if (made.length + moved.length + removed.length === 0) return null;
  return {
    ids: [...made, ...moved.map((m) => m.id), ...removed.map((r) => r.id)],
    undo: async (tx, at) => {
      if (made.length > 0) await tx.execute(`update time_blocks set deleted_at = ?, updated_at = ? where id in (${placeholders(made)})`, [at, at, ...made]);
      for (const m of moved) await tx.execute(`update time_blocks set start_at = ?, end_at = ?, updated_at = ? where id = ?`, [m.start_at, m.end_at, at, m.id]);
      if (removed.length > 0) await reviveBlocks(tx, removed, at);
    },
  };
}
