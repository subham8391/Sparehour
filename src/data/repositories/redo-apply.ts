// The write half of the generic redo (undo.ts `redoable`): it puts declared rows back into one of their two captured
// states. Loaded once something has been undone, so no app shell carries it (SYSTEM_DESIGN.md §11.6).
import type { LocalDatabase } from "../powersync";
import { restoreRow, type RowSnapshot, type RowState, type UndoTable } from "./undo";

/** A row's identity and bookkeeping: no redo writes these. */
const IDENTITY = new Set(["id", "space_id", "user_id", "created_at", "updated_at"]);

/**
 * Columns the server owns (src/server/sync/upload.ts SERVER_OWNED_COLUMNS, without the ones a person may clear): the
 * upload drops a client value for them, so a redo leaves them to the server rather than show a stale one meanwhile.
 */
export const SERVER_KEEPS: Partial<Record<UndoTable, readonly string[]>> = {
  tasks: ["carry_count", "last_carried_at", "last_touched_at", "assignee_id", "expired_at"],
  task_completions: ["carry_count_before", "last_carried_before"],
  time_blocks: ["external_event_id", "external_etag", "push_state"],
  user_settings: ["deleted_at"],
};

/** The columns where the row differs from `other` (every writable one when there is no other), bookkeeping left out. */
function changedColumns(table: UndoTable, row: RowSnapshot, other: RowSnapshot | null): string[] {
  const kept = SERVER_KEEPS[table] ?? [];
  return Object.keys(row).filter((c) => !IDENTITY.has(c) && !kept.includes(c) && (other === null || (row[c] ?? null) !== (other[c] ?? null)));
}

const keyOf = (table: string, id: string) => `${table}\u0000${id}`;

/**
 * Writes each row back to its state in `to`, in the columns where it differs from `from`: the columns one undo (or
 * redo) changed and nothing else, so a field another device edited since stays as it is. A row that has left the
 * device is re-inserted (restoreRow). A row with no state in `to` was not on the device then and is left alone.
 */
export async function applyRows(db: Pick<LocalDatabase, "writeTransaction">, to: readonly RowState[], from: readonly RowState[]): Promise<void> {
  const other = new Map(from.map((s) => [keyOf(s.table, s.id), s.row]));
  // One transaction: sync must not take a row off the device between a presence check and its write.
  await db.writeTransaction(async (tx) => {
    const at = new Date().toISOString();
    for (const { table, id, row } of to) {
      if (!row) continue;
      const was = other.get(keyOf(table, id)) ?? null;
      const columns = changedColumns(table, row, was);
      if (columns.length > 0) await restoreRow(tx, table, row, columns, at, was);
    }
  });
}
