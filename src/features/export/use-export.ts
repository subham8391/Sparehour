"use client";
// One-click export from the local database (PRODUCT_SPEC.md §19.1): the
// rows are read here, the files are built by the pure core, and the browser
// saves them. Works offline; the server is never involved.
import { strToU8, zipSync } from "fflate";
import { useCallback, useState } from "react";
import { useLocalDatabase } from "@/data/powersync";
import { EXPORT_TABLES, csvExport, jsonExport, markdownFiles, type ExportFormat, type ExportSnapshot, type Row } from "@/core/export";

const WITHOUT_DELETED_AT = new Set<string>(["user_settings"]);

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

/** The bytes and name for a format, from a snapshot. */
export function buildExport(format: ExportFormat, snapshot: ExportSnapshot, now: Date): { name: string; blob: Blob } {
  const stamp = now.toISOString().slice(0, 10);
  if (format === "json") return { name: `sparehour-export-${stamp}.json`, blob: new Blob([jsonExport(snapshot, now.toISOString())], { type: "application/json" }) };
  if (format === "csv") return { name: `sparehour-tasks-${stamp}.csv`, blob: new Blob([csvExport(snapshot)], { type: "text/csv" }) };
  const files = markdownFiles(snapshot, stamp);
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
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);
  const exportData = useCallback(
    async (format: ExportFormat) => {
      setBusy(format);
      setError(null);
      try {
        const snapshot = await readSnapshot((sql, params) => db.getAll(sql, params));
        const { name, blob } = buildExport(format, snapshot, new Date());
        saveBlob(name, blob);
        setLastFile(name);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [db],
  );
  return { exportData, busy, error, lastFile };
}
