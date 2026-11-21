// What an export is made from (PRODUCT_SPEC.md §19.1; DECISIONS.md, amendment 2026-11-14): the rows on the device,
// the week of finished tasks the logbook stream brings, and the older ones the server keeps, fetched a page at a
// time. Complete only with both halves; offline it is still made from what the device has, and the files say so.
// Free of the browser's file saving and of the zip library, so the web's export (build.ts, which hands these on to
// use-export.ts) and the Android app's gather the same rows the same way (docs/mobile/ANDROID_APP_SPEC.md §4.3).
// It reads core/export, so on the web it stays in the export's island; the wait alone is finished-wait.ts.
import { EXPORT_TABLES, type ExportFormat, type ExportSnapshot, type Row } from "@/core/export";
import type { LocalDate } from "@/core/time";
import type { LocalDatabase } from "@/data/powersync";
import type { FinishedRow } from "@/features/finished/finished";
import { FINISHED_TASKS_WAIT_MS, fetchFinishedTasks, fetchOlderFinished } from "./finished-wait";
import { withFinished } from "./older";

const WITHOUT_DELETED_AT = new Set<string>(["user_settings"]);

export async function readSnapshot(getAll: <T>(sql: string, params?: unknown[]) => Promise<T[]>): Promise<ExportSnapshot> {
  const entries = await Promise.all(EXPORT_TABLES.map(async (table) => [table, await getAll<Row>(`select * from ${table}${WITHOUT_DELETED_AT.has(table) ? "" : " where deleted_at is null"}`)] as const));
  return Object.fromEntries(entries) as ExportSnapshot;
}

/** What a format's file is called: "sparehour-export-2026-11-22.json". `stamp` is the day, YYYY-MM-DD. */
export function exportName(format: ExportFormat, stamp: string): string {
  if (format === "json") return `sparehour-export-${stamp}.json`;
  if (format === "csv") return `sparehour-tasks-${stamp}.csv`;
  return `sparehour-markdown-${stamp}.zip`;
}

export interface Gathered {
  /** Every table's rows, the older finished tasks unfolded into them when they could be fetched. */
  snapshot: ExportSnapshot;
  /** Complete only with both halves: the week the device syncs, and what the server keeps from before it. */
  complete: boolean;
}

/**
 * Everything an export holds, read now: the finished week is waited for (longer with a connection), the older
 * finished tasks are fetched, the device's rows are read. `fetchAll` is how the older ones are asked for where the
 * browser's own fetch cannot (the Android app sends its session's token).
 */
export async function gatherExport(db: Pick<LocalDatabase, "syncStream" | "getAll" | "currentStatus">, today: LocalDate, fetchAll?: () => Promise<FinishedRow[]>): Promise<Gathered> {
  const finished = await fetchFinishedTasks(db, today, db.currentStatus?.connected ? FINISHED_TASKS_WAIT_MS.online : FINISHED_TASKS_WAIT_MS.offline);
  try {
    const older = await fetchOlderFinished(fetchAll);
    const snapshot = await readSnapshot((sql, params) => db.getAll(sql, params));
    return { snapshot: older ? withFinished(snapshot, older) : snapshot, complete: finished.synced && older !== null };
  } finally {
    finished.release();
  }
}
