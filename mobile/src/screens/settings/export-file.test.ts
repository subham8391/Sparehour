// An export as the phone hands it over: the web's own file per format, the Markdown as a zip.
import { EXPORT_TABLES, markdownFiles, type ExportSnapshot, type Row } from "@/core/export";
import { exportFile } from "./export-file";
import { zip } from "./zip";

const NOW = new Date("2026-11-22T10:00:00Z");
const row = (id: string, more: Row = {}): Row => ({ id, space_id: "s1", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", deleted_at: null, ...more });
const snapshot = (): ExportSnapshot => {
  const empty = Object.fromEntries(EXPORT_TABLES.map((t) => [t, [] as Row[]])) as ExportSnapshot;
  return {
    ...empty,
    projects: [row("p1", { name: "Acme launch", state: "active" }), row("p2", { name: "Read more", state: "active" })],
    tasks: [row("t1", { title: "Draft the proposal", state: "active", project_id: "p1" }), row("t2", { title: "Call the bank", state: "inbox" })],
  };
};

describe("exportFile", () => {
  it("names and types each format as the web does", () => {
    expect(exportFile("json", snapshot(), NOW)).toMatchObject({ name: "sparehour-export-2026-11-22.json", type: "application/json" });
    expect(exportFile("csv", snapshot(), NOW)).toMatchObject({ name: "sparehour-tasks-2026-11-22.csv", type: "text/csv" });
    expect(exportFile("markdown", snapshot(), NOW)).toMatchObject({ name: "sparehour-markdown-2026-11-22.zip", type: "application/zip" });
  });

  it("JSON is the web's complete export, and says when finished tasks could not be fetched", () => {
    const whole = JSON.parse(exportFile("json", snapshot(), NOW, { finishedTasks: true }).content as string);
    expect(whole).toMatchObject({ format: "sparehour-export", version: 1, exported_at: "2026-11-22T10:00:00.000Z", finished_tasks_included: true });
    expect(whole.tables.tasks).toHaveLength(2);
    expect(JSON.parse(exportFile("json", snapshot(), NOW, { finishedTasks: false }).content as string).finished_tasks_included).toBe(false);
  });

  it("CSV is the flat task table", () => {
    const lines = (exportFile("csv", snapshot(), NOW).content as string).trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Draft the proposal");
  });

  it("Markdown is a zip of the web's own files, one per project, under the web's paths", () => {
    const file = exportFile("markdown", snapshot(), NOW);
    const files = markdownFiles(snapshot(), "2026-11-22");
    expect(files.some((f) => /acme-launch/.test(f.path))).toBe(true);
    expect(file.content).toBeInstanceOf(Uint8Array);
    expect(Array.from(file.content as Uint8Array)).toEqual(Array.from(zip(files, NOW)));
  });
});
