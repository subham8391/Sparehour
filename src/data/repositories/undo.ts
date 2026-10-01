// What every repository shares for undo (FEATURES.md §8 "Undo for every
// action", PRODUCT_SPEC.md §7 rule 4): the recorder they write into, and the
// one way a row is put back as it was.
import type { LocalDatabase } from "../powersync";

/** Where the inverse of each write goes (the undo stack); optional so scripts and tests can skip it. */
export interface UndoRecorder {
  record: (entry: { label: string; toast: boolean; undo: () => Promise<void> }) => void;
}

export type Tx = Parameters<Parameters<LocalDatabase["writeTransaction"]>[0]>[0];
export type RowSnapshot = Record<string, string | number | null> & { id: string };

/** The synced tables a repository may put a row back into. A closed list: the name goes into SQL. */
export type UndoTable = "tasks" | "projects" | "headings" | "areas" | "task_tags" | "checklist_items";

/** A name as the undo toast quotes it: “Draft the proposal”. */
export const quoted = (name: string | number | null | undefined): string => `“${String(name ?? "")}”`;

export const placeholders = (ids: readonly unknown[]): string => ids.map(() => "?").join(", ");

/**
 * Restores `columns` on one row; if the row has left the device, re-inserts it
 * from the snapshot. Sync takes a row off the device once it is deleted (and a
 * task once it is done), so an undo a few seconds later can find nothing to
 * update. Presence is checked with a read: the local tables are views, and an
 * update through them reports zero rows affected either way. Run it inside
 * the caller's writeTransaction, so sync cannot take the row away between the
 * check and the write. For a soft delete, pass `deleted_at` among the columns.
 */
export async function restoreRow(tx: Pick<Tx, "execute" | "getOptional">, table: UndoTable, before: RowSnapshot, columns: readonly string[], at: string): Promise<void> {
  const id = before.id;
  const update = () => tx.execute(`update ${table} set ${columns.map((c) => `${c} = ?`).join(", ")}, updated_at = ? where id = ?`, [...columns.map((c) => before[c] ?? null), at, id]);
  const present = await tx.getOptional<{ id: string }>(`select id from ${table} where id = ?`, [id]);
  if (present) {
    await update();
    return;
  }
  const row: Record<string, string | number | null> = { ...before, id, updated_at: at };
  // The sync layer uploads an insert without its null columns, and an update only with the columns it changed
  // (PowerSync diffs old and new). A timestamp being restored to null (deleted_at, completed_at) is therefore
  // inserted as `at` and cleared by the update below, so the clearing is a change and reaches the server; it was
  // set there, and inserted as null here it never got unset (the e2e suite found a revived block still deleted).
  for (const c of columns) if (row[c] == null && c.endsWith("_at")) row[c] = at;
  const cols = Object.keys(row);
  await tx.execute(`insert into ${table} (${cols.join(", ")}) values (${placeholders(cols)})`, cols.map((c) => row[c] ?? null));
  await update();
}
