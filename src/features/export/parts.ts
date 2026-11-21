// What an export's file is, before anything saves it (PRODUCT_SPEC.md §19.1): its name, its type, and its text, or
// for Markdown the files that go into the zip, one per project. Free of the browser's Blob and of the zip library, so
// the web's export (build.ts zips and saves) and the Android app's (which writes a real file and hands it to the
// share sheet) make the same file from the same snapshot (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import { csvExport, jsonExport, markdownFiles, type ExportFile, type ExportFormat, type ExportOptions, type ExportSnapshot } from "@/core/export";
import { exportName } from "./gather";

export type ExportParts = { name: string; type: string } & ({ text: string } | { files: ExportFile[] });

/** A format's file from a snapshot: one text (JSON, CSV), or the Markdown files to zip. */
export function exportParts(format: ExportFormat, snapshot: ExportSnapshot, now: Date, opts: ExportOptions = {}): ExportParts {
  const stamp = now.toISOString().slice(0, 10);
  const name = exportName(format, stamp);
  if (format === "json") return { name, type: "application/json", text: jsonExport(snapshot, now.toISOString(), opts) };
  if (format === "csv") return { name, type: "text/csv", text: csvExport(snapshot) };
  return { name, type: "application/zip", files: markdownFiles(snapshot, stamp, opts) };
}
