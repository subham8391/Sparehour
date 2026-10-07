// Clear the slate and its archive (PRODUCT_SPEC.md §8.5, §6 "Archiving is
// reversible and keeps everything"; M1 gap rulings 2026-10-06). Loaded on the
// click that asks for it, never with a shell (SYSTEM_DESIGN.md §11.6).
//
// Clearing archives every task in the scope in one statement under one new
// batch id, keeping the state each left and its do-date; future blocks they
// held are let go, as a retirement does. One undo puts all of it back. A batch
// restore — from Settings › Data › Archive, any time later — returns each task
// to the state it left with its date, so one whose day has passed lands in
// Carried over; the carry count is the server's and starts again at zero.
import type { SlateScope } from "@/core/rollover";
import type { LocalDatabase } from "../powersync";
import { slateWhere } from "../queries/archive";
import { reviveBlocks } from "./block-revive";
import { releaseFutureBlocks } from "./convert";
import { placeholders, restoreRow, type RowSnapshot, type UndoRecorder } from "./undo";

/** The columns archiving writes, and every undo or restore puts back. */
const ARCHIVE_COLUMNS = ["state", "archive_batch_id", "archived_from_state", "archived_at"] as const;
const RESTORABLE = new Set(["inbox", "active", "someday"]);

const tasksWord = (n: number) => (n === 1 ? "1 task" : `${n} tasks`);

/** "Slate cleared. 47 tasks archived" — the toast adds "Undo" (PRODUCT_SPEC.md §8.5 rule 6). */
export const slateClearedLabel = (n: number): string => `Slate cleared. ${tasksWord(n)} archived`;

/**
 * Archives every task in the scope as one batch, today being the person's local date (YYYY-MM-DD). Resolves how
 * many went; nothing in the scope is a no-op with no undo entry.
 */
export async function clearTheSlate(db: LocalDatabase, history: UndoRecorder | undefined, scope: SlateScope, today: string): Promise<number> {
  const at = new Date().toISOString();
  const batch = crypto.randomUUID();
  const { where, args } = slateWhere(scope, today);
  const result = await db.writeTransaction(async (tx) => {
    const before = await tx.getAll<RowSnapshot>(`select * from tasks where ${where}`, args);
    if (before.length === 0) return null;
    const ids = before.map((r) => r.id);
    // One statement, one batch: the state each task leaves is read from the row as it is written.
    await tx.execute(
      `update tasks set state = 'archived', archive_batch_id = ?, archived_from_state = state, archived_at = ?, updated_at = ? where id in (${placeholders(ids)})`,
      [batch, at, at, ...ids],
    );
    const released = await releaseFutureBlocks(tx, ids, at);
    return { before, released };
  });
  if (!result) return 0;
  const { before, released } = result;
  history?.record({
    label: slateClearedLabel(before.length),
    toast: true,
    undo: () =>
      db.writeTransaction(async (tx) => {
        const now = new Date().toISOString();
        for (const row of before) await restoreRow(tx, "tasks", row, ARCHIVE_COLUMNS, now);
        if (released.length > 0) await reviveBlocks(tx, released, now);
      }),
  });
  return before.length;
}

/**
 * Brings a batch back (null: the tasks archived before batches existed): each task returns to the state it left —
 * active when that is unknown — with its dates, and leaves the archive. One undo sends them back into the batch.
 * Resolves how many came back.
 */
export async function restoreBatch(db: LocalDatabase, history: UndoRecorder | undefined, batchId: string | null): Promise<number> {
  const at = new Date().toISOString();
  const rows = await db.writeTransaction(async (tx) => {
    const before = await tx.getAll<RowSnapshot>(
      `select * from tasks where deleted_at is null and state = 'archived' and ${batchId === null ? "archive_batch_id is null" : "archive_batch_id = ?"}`,
      batchId === null ? [] : [batchId],
    );
    if (before.length === 0) return null;
    const ids = before.map((r) => r.id);
    await tx.execute(
      `update tasks set state = case when archived_from_state in (${[...RESTORABLE].map((s) => `'${s}'`).join(", ")}) then archived_from_state else 'active' end,
              archive_batch_id = null, archived_from_state = null, archived_at = null, updated_at = ?
        where id in (${placeholders(ids)})`,
      [at, ...ids],
    );
    return before;
  });
  if (!rows) return 0;
  history?.record({
    label: `Brought back ${tasksWord(rows.length)}`,
    toast: true,
    undo: () =>
      db.writeTransaction(async (tx) => {
        const now = new Date().toISOString();
        for (const row of rows) await restoreRow(tx, "tasks", row, ARCHIVE_COLUMNS, now);
      }),
  });
  return rows.length;
}
