"use client";
// One-click export (PRODUCT_SPEC.md §19.1): the rows are read from the local
// database, the files are built by the pure core, and the browser saves
// them. Finished tasks are not in the working set: the last week's arrive
// through the on-demand logbook stream, so the export first makes sure that
// stream has synced, and the ones before that are kept on the server and
// fetched a page at a time (DECISIONS.md, amendment 2026-11-14). Offline, it
// still saves what the device has, says that finished tasks are missing, and
// the files say so too.
import { useCallback, useEffect, useState } from "react";
import type { ExportFormat } from "@/core/export";
import { useLocalDatabase } from "@/data/powersync";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { FINISHED_TASKS_OFFLINE } from "./finished-wait";

// The wait for finished tasks is in finished-wait.ts, shared with the Android app; handed on, so imports are unchanged.
export { FINISHED_TASKS_OFFLINE, FINISHED_TASKS_WAIT_MS, fetchFinishedTasks, fetchOlderFinished, type FinishedTasks } from "./finished-wait";

// The file builders and the zip library are an island (SYSTEM_DESIGN.md §11.6): fetched once Settings is idle,
// so the first export never waits on the network and still works offline.
const loadBuild = () => import("./build");

export interface ExportApi {
  exportData: (format: ExportFormat) => Promise<void>;
  busy: ExportFormat | null;
  error: string | null;
  /** Last export, for the "Saved sparehour-export-….json" line. */
  lastFile: string | null;
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
  useEffect(() => preloadOnIdle(loadBuild), []);
  const exportData = useCallback(
    async (format: ExportFormat) => {
      setBusy(format);
      setError(null);
      try {
        // Gathering the rows (the finished week waited for, the older ones fetched) is the island's too: gather.ts,
        // shared with the Android app. Complete only with both halves.
        const { buildExport, gatherExport } = await loadBuild();
        const { snapshot, complete } = await gatherExport(db, today);
        const { name, blob } = buildExport(format, snapshot, new Date(), { finishedTasks: complete });
        saveBlob(name, blob);
        setLastFile(name);
        if (!complete) setError(FINISHED_TASKS_OFFLINE);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [db, today],
  );
  return { exportData, busy, error, lastFile };
}
