// The generic redo's capture half (SCREENS.md §24 "Cmd+Shift+Z", §12 "Undo · Redo"): one mechanism, no repository
// has a redo of its own. The undo provider wraps each recorded write with it; it rides in no shell's first download,
// fetched in idle time (features/undo/undo-provider.tsx), and the write half (redo-apply.ts) loads once something is
// undone (SYSTEM_DESIGN.md §11.6).
import type { LocalDatabase } from "../powersync";
import { placeholders, type Redo, type RowSnapshot, type UndoRecord, type UndoRows, type UndoTable } from "./undo";

/** One declared row in one state: its snapshot, or null when it was not on the device. */
export interface RowState {
  table: UndoTable;
  id: string;
  row: RowSnapshot | null;
}

/** Statements stay well under SQLite's bound-parameter limit however many tasks a batch touched. */
const CHUNK = 500;

/** The declared rows as they are now, whole. */
export async function captureRows(db: Pick<LocalDatabase, "getAll">, rows: UndoRows): Promise<RowState[]> {
  const out: RowState[] = [];
  for (const [table, set] of Object.entries(rows) as [UndoTable, UndoRows[UndoTable]][]) {
    if (!set) continue;
    const byTask = "task_id" in set;
    const ids = [...new Set(byTask ? set.task_id : (set as readonly string[]))];
    const found: RowSnapshot[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK);
      const got = await db.getAll<RowSnapshot>(`select * from ${table} where ${byTask ? "task_id" : "id"} in (${placeholders(part)})`, part);
      if (Array.isArray(got)) found.push(...got);
    }
    if (byTask) {
      for (const row of found) out.push({ table, id: row.id, row: { ...row } });
      continue;
    }
    const byId = new Map(found.map((r) => [r.id, r]));
    for (const id of ids) {
      const row = byId.get(id);
      out.push({ table, id, row: row ? { ...row } : null });
    }
  }
  return out;
}

/** An entry whose undo hands back its redo (or nothing, when its rows could not be read). */
export interface RedoableEntry {
  label: string;
  toast: boolean;
  announce?: string;
  undo: () => Promise<Redo | undefined>;
}

/**
 * Makes a recorded write redoable. Its rows are read as the write left them the moment it is made redoable, as it is
 * recorded (the write has just run, and sync leaves a row with changes still to upload where it is; the undo provider
 * waits for nothing but this module, which is in memory by then), again just before its undo runs
 * (so a field another device changed meanwhile is what the redo keeps), and once more after it; the redo writes
 * back the columns the undo changed, and an undo after the redo writes them back again (redo-apply.ts). A new action
 * clears the redo stack (the undo provider), so a redo never lands on top of a later change.
 */
export function redoable(db: Pick<LocalDatabase, "getAll" | "writeTransaction">, entry: UndoRecord): RedoableEntry {
  const done = captureRows(db, entry.rows);
  done.catch(() => undefined);
  return {
    label: entry.label,
    toast: entry.toast,
    ...(entry.announce ? { announce: entry.announce } : {}),
    undo: async () => {
      const pre = await captureRows(db, entry.rows).catch(() => null);
      await entry.undo();
      let after: RowState[];
      let undone: RowState[];
      try {
        [after, undone] = await Promise.all([done, captureRows(db, entry.rows)]);
      } catch {
        // Rows that cannot be read leave the change undone, and not redoable.
        return undefined;
      }
      // The write half loads now, while the toast offers Redo, and never with a shell.
      const apply = import("./redo-apply");
      apply.catch(() => undefined);
      return {
        redo: async () => {
          const { applyRows, beforeUndo } = await apply;
          await applyRows(db, beforeUndo(pre, after), undone);
          entry.settled?.("redone");
        },
        undo: async () => {
          const { applyRows, beforeUndo } = await apply;
          await applyRows(db, undone, beforeUndo(pre, after));
          entry.settled?.("undone");
        },
      };
    },
  };
}
