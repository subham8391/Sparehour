// The heavy half of the export (SYSTEM_DESIGN.md §11.6): the pure core that
// shapes the files and the zip library. Settings loads it in idle time and
// the export button waits for it, so neither rides in the first download.
import { strToU8, zipSync } from "fflate";
import { EXPORT_TABLES, csvExport, jsonExport, markdownFiles, type ExportFormat, type ExportOptions, type ExportSnapshot, type Row } from "@/core/export";

const WITHOUT_DELETED_AT = new Set<string>(["user_settings"]);

export async function readSnapshot(getAll: <T>(sql: string, params?: unknown[]) => Promise<T[]>): Promise<ExportSnapshot> {
  const entries = await Promise.all(EXPORT_TABLES.map(async (table) => [table, await getAll<Row>(`select * from ${table}${WITHOUT_DELETED_AT.has(table) ? "" : " where deleted_at is null"}`)] as const));
  return Object.fromEntries(entries) as ExportSnapshot;
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
