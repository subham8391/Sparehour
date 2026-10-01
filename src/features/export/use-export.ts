"use client";
// One-click export (PRODUCT_SPEC.md §19.1): the rows are read from the local
// database, the files are built by the pure core, and the browser saves
// them. Finished tasks are not in the working set — they arrive through the
// on-demand logbook stream, and the server keeps them only a week — so the
// export first makes sure that stream has synced. Offline, it still saves
// what the device has, says that finished tasks are missing, and the files
// say so too.
import { strToU8, zipSync } from "fflate";
import { useCallback, useState } from "react";
import type { LocalDate } from "@/core/time";
import { useLocalDatabase, type LocalDatabase } from "@/data/powersync";
import { logbookStream } from "@/data/queries/views";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { EXPORT_TABLES, csvExport, jsonExport, markdownFiles, type ExportFormat, type ExportOptions, type ExportSnapshot, type Row } from "@/core/export";

const WITHOUT_DELETED_AT = new Set<string>(["user_settings"]);

/** How long the export waits for finished tasks with a connection, and without one (time for an earlier sync to be recognised). */
export const FINISHED_TASKS_WAIT_MS = { online: 15_000, offline: 2_000 } as const;

/** Shown beside "Saved …" when the finished tasks could not be fetched. */
export const FINISHED_TASKS_OFFLINE = "Saved without finished tasks: the export needs a connection to include them. Export again once you're online.";

export interface ExportApi {
  exportData: (format: ExportFormat) => Promise<void>;
  busy: ExportFormat | null;
  error: string | null;
  /** Last export, for the "Saved sparehour-export-….json" line. */
  lastFile: string | null;
}

export async function readSnapshot(getAll: <T>(sql: string, params?: unknown[]) => Promise<T[]>): Promise<ExportSnapshot> {
  const entries = await Promise.all(EXPORT_TABLES.map(async (table) => [table, await getAll<Row>(`select * from ${table}${WITHOUT_DELETED_AT.has(table) ? "" : " where deleted_at is null"}`)] as const));
  return Object.fromEntries(entries) as ExportSnapshot;
}

export interface FinishedTasks {
  /** True once every finished task (the logbook stream's months) is on this device. */
  synced: boolean;
  /** Lets go of the subscription; the stream's TTL keeps the rows cached for a while after. */
  release: () => void;
}

/**
 * Subscribes the logbook stream for every month a finished task can still be in and waits for its first sync,
 * at most `timeoutMs`. The same months as the Logbook and search, so an earlier visit makes this immediate.
 */
export async function fetchFinishedTasks(db: Pick<LocalDatabase, "syncStream">, today: LocalDate, timeoutMs: number): Promise<FinishedTasks> {
  const { name, parameters } = logbookStream(today);
  const subscription = await db.syncStream(name, parameters).subscribe({ ttl: 60 * 60 });
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const synced = await Promise.race([
    subscription.waitForFirstSync(abort.signal).then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    }),
  ]);
  clearTimeout(timer);
  abort.abort();
  return { synced, release: () => subscription.unsubscribe() };
}

/** The bytes and name for a format, from a snapshot. */
export function buildExport(format: ExportFormat, snapshot: ExportSnapshot, now: Date, opts: ExportOptions = {}): { name: string; blob: Blob } {
  const stamp = now.toISOString().slice(0, 10);
  if (format === "json") return { name: `sparehour-export-${stamp}.json`, blob: new Blob([jsonExport(snapshot, now.toISOString(), opts)], { type: "application/json" }) };
  if (format === "csv") return { name: `sparehour-tasks-${stamp}.csv`, blob: new Blob([csvExport(snapshot)], { type: "text/csv" }) };
  const files = markdownFiles(snapshot, stamp, opts);
  const zip = zipSync(Object.fromEntries(files.map((f) => [f.path, strToU8(f.content)])), { level: 6 });
  return { name: `sparehour-markdown-${stamp}.zip`, blob: new Blob([zip as BlobPart], { type: "application/zip" }) };
}

function saveBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function useExport(): ExportApi {
  const db = useLocalDatabase();
  const now = useNow();
  const { today } = useLocalDay(now);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);
  const exportData = useCallback(
    async (format: ExportFormat) => {
      setBusy(format);
      setError(null);
      let finished: FinishedTasks | null = null;
      try {
        finished = await fetchFinishedTasks(db, today, db.currentStatus?.connected ? FINISHED_TASKS_WAIT_MS.online : FINISHED_TASKS_WAIT_MS.offline);
        const snapshot = await readSnapshot((sql, params) => db.getAll(sql, params));
        const { name, blob } = buildExport(format, snapshot, new Date(), { finishedTasks: finished.synced });
        saveBlob(name, blob);
        setLastFile(name);
        if (!finished.synced) setError(FINISHED_TASKS_OFFLINE);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        finished?.release();
        setBusy(null);
      }
    },
    [db, today],
  );
  return { exportData, busy, error, lastFile };
}
