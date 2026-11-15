// How long a finished task took (DECISIONS.md, amendment 2026-11-15): `actual_min` on the task, or for a repeat on
// the completion of the day that was finished. It is asked in the completion's own toast and can be set on a
// finished task's detail; the estimates learn from it (core/estimates). No shell carries this: the toast's chips and
// the detail load it.
import type { LocalDatabase } from "../powersync";
import { quoted, restoreRow, type RowSnapshot, type TookAsk, type UndoRecorder } from "./undo";

export type { TookAsk } from "./undo";

export interface TookRow {
  /** The row as it is on the device now, so the length can still be written once sync has taken the row away. */
  snapshot: RowSnapshot;
  /** What the task was estimated at, if it was: the chips are offered around it. */
  estimateMin: number | null;
  /** What is recorded already. */
  actualMin: number | null;
  /** The account's default estimate (Settings › Planning): what a task without an estimate was counted as. */
  defaultMin: number;
}

const number = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The row a length would be written on, read while it is still on the device; null when it is not. */
export async function tookRow(db: LocalDatabase, ask: TookAsk): Promise<TookRow | null> {
  const snapshot = (await db.getOptional<RowSnapshot>(`select * from ${ask.table} where id = ?`, [ask.id])) ?? null;
  if (!snapshot) return null;
  const settings = await db.getOptional<{ default_estimate_min: number | null }>(`select default_estimate_min from user_settings limit 1`);
  const defaultMin = number(settings?.default_estimate_min) ?? 30;
  if (ask.table === "tasks") return { snapshot, estimateMin: number(snapshot.estimate_min), actualMin: number(snapshot.actual_min), defaultMin };
  const task = await db.getOptional<{ estimate_min: number | null }>(`select estimate_min from tasks where id = ?`, [snapshot.task_id]);
  return { snapshot, estimateMin: number(task?.estimate_min), actualMin: number(snapshot.actual_min), defaultMin };
}

/**
 * Writes the length (null clears it). A finished task leaves the device a moment after its completion uploads, so
 * the row is put back from the snapshot when it has gone (restoreRow) and the one column still reaches the server;
 * `held` is the length written before, so clearing it there is a change too.
 */
export async function writeTook(db: LocalDatabase, ask: TookAsk, snapshot: RowSnapshot, minutes: number | null, held: number | null = null): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await restoreRow(tx, ask.table, { ...snapshot, actual_min: minutes }, ["actual_min"], new Date().toISOString(), { id: snapshot.id, actual_min: held });
  });
}

/** The same from a finished task's detail, where the row is on the device: one write, undoable without a toast. */
export async function setTook(db: LocalDatabase, history: UndoRecorder | null | undefined, id: string, minutes: number | null): Promise<void> {
  const before = (await db.getOptional<RowSnapshot>(`select * from tasks where id = ?`, [id])) ?? null;
  if (!before || number(before.actual_min) === minutes) return;
  await db.execute(`update tasks set actual_min = ?, updated_at = ? where id = ?`, [minutes, new Date().toISOString(), id]);
  history?.record({
    label: `Changed how long ${quoted(before.title)} took`,
    toast: false,
    rows: { tasks: [id] },
    undo: () => db.writeTransaction((tx) => restoreRow(tx, "tasks", before, ["actual_min"], new Date().toISOString())),
  });
}
