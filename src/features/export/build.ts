// The heavy half of the export (SYSTEM_DESIGN.md §11.6): the pure core that
// shapes the files and the zip library. Settings loads it in idle time and
// the export button waits for it, so neither rides in the first download.
import { strToU8, zipSync } from "fflate";
import { csvExport, jsonExport, markdownFiles, type ExportFormat, type ExportOptions, type ExportSnapshot } from "@/core/export";
import { exportName } from "./gather";

export { withFinished } from "./older";
// Reading the device's rows and gathering an export are in gather.ts, shared with the Android app; handed on, so
// imports are unchanged.
export { gatherExport, readSnapshot } from "./gather";

/** The bytes and name for a format, from a snapshot. */
export function buildExport(format: ExportFormat, snapshot: ExportSnapshot, now: Date, opts: ExportOptions = {}): { name: string; blob: Blob } {
  const stamp = now.toISOString().slice(0, 10);
  const name = exportName(format, stamp);
  if (format === "json") return { name, blob: new Blob([jsonExport(snapshot, now.toISOString(), opts)], { type: "application/json" }) };
  if (format === "csv") return { name, blob: new Blob([csvExport(snapshot)], { type: "text/csv" }) };
  const files = markdownFiles(snapshot, stamp, opts);
  const zip = zipSync(Object.fromEntries(files.map((f) => [f.path, strToU8(f.content)])), { level: 6 });
  return { name, blob: new Blob([zip as BlobPart], { type: "application/zip" }) };
}
