// The heavy half of the export (SYSTEM_DESIGN.md §11.6): the pure core that
// shapes the files and the zip library. Settings loads it in idle time and
// the export button waits for it, so neither rides in the first download.
import { strToU8, zipSync } from "fflate";
import type { ExportFormat, ExportOptions, ExportSnapshot } from "@/core/export";
import { exportParts } from "./parts";

export { withFinished } from "./older";
// Reading the device's rows and gathering an export are in gather.ts, shared with the Android app; handed on, so
// imports are unchanged.
export { gatherExport, readSnapshot } from "./gather";

/** The bytes and name for a format, from a snapshot. What each format's file holds is parts.ts, shared with the Android app. */
export function buildExport(format: ExportFormat, snapshot: ExportSnapshot, now: Date, opts: ExportOptions = {}): { name: string; blob: Blob } {
  const parts = exportParts(format, snapshot, now, opts);
  if ("text" in parts) return { name: parts.name, blob: new Blob([parts.text], { type: parts.type }) };
  const zip = zipSync(Object.fromEntries(parts.files.map((f) => [f.path, strToU8(f.content)])), { level: 6 });
  return { name: parts.name, blob: new Blob([zip as BlobPart], { type: parts.type }) };
}
