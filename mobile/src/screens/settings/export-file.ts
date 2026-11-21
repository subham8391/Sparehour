// An export as the phone hands it over (PRODUCT_SPEC.md §19.1): the file the web saves, made from the same snapshot
// by the same builders (../../../../src/features/export/parts.ts): JSON and CSV as their text, Markdown as a zip
// with one file per project. The web's zip is deflated by a library this app does not carry; the phone's holds the
// same files under the same paths, stored as they are (zip.ts). Pure.
import type { ExportFormat, ExportOptions, ExportSnapshot } from "@/core/export";
import { exportParts } from "@/features/export/parts";
import { zip } from "./zip";

export interface ExportedFile {
  /** The web's own file name: "sparehour-export-2026-11-22.json". */
  name: string;
  /** Its MIME type, for the share sheet. */
  type: string;
  /** What is written to the file: text, or the zip's bytes. */
  content: string | Uint8Array;
}

export function exportFile(format: ExportFormat, snapshot: ExportSnapshot, now: Date, opts: ExportOptions = {}): ExportedFile {
  const parts = exportParts(format, snapshot, now, opts);
  return { name: parts.name, type: parts.type, content: "text" in parts ? parts.text : zip(parts.files, now) };
}
