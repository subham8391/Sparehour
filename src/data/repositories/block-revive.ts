// Bringing soft-deleted time blocks back for an undo: the one part of the block writes the task repository needs
// (a completed, archived, converted or skipped task takes its blocks with it, and its undo brings them back). Its
// own module so the shells, which carry the task repository, do not carry BlockRepo too: Turbopack keeps a module
// whole (SYSTEM_DESIGN.md §11.6).
import type { LocalDatabase } from "../powersync";

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
