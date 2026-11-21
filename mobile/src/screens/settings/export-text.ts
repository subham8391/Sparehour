// An export as the phone hands it over (PRODUCT_SPEC.md §19.1): the same content the web builds, by the same
// builders (../../../../src/core/export), as one piece of text for the system's share sheet. The web saves a file
// and zips the Markdown, one file per project; a phone app without a file-sharing module can only share text, so
// here the Markdown files follow one another in one text, each under the path the zip would give it. Pure.
import { csvExport, jsonExport, markdownFiles, type ExportFormat, type ExportOptions, type ExportSnapshot } from "@/core/export";
import { exportName } from "@/features/export/gather";

export interface ExportText {
  /** What the export is called: the web's file name, and ".md" where the web has a zip. */
  name: string;
  text: string;
}

export function exportText(format: ExportFormat, snapshot: ExportSnapshot, now: Date, opts: ExportOptions = {}): ExportText {
  const stamp = now.toISOString().slice(0, 10);
  if (format === "json") return { name: exportName("json", stamp), text: jsonExport(snapshot, now.toISOString(), opts) };
  if (format === "csv") return { name: exportName("csv", stamp), text: csvExport(snapshot) };
  const files = markdownFiles(snapshot, stamp, opts);
  return { name: exportName("markdown", stamp).replace(/\.zip$/, ".md"), text: files.map((f) => `<!-- ${f.path} -->\n\n${f.content.trimEnd()}\n`).join("\n---\n\n") };
}
