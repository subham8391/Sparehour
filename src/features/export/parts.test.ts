// What an export's file is, before the web zips and saves it or the Android app writes and shares it.
import { describe, expect, it } from "vitest";
import { EXPORT_TABLES, type ExportSnapshot, type Row } from "@/core/export";
import { exportParts } from "./parts";

const NOW = new Date("2026-11-22T10:00:00Z");
const snapshot = (): ExportSnapshot => {
  const empty = Object.fromEntries(EXPORT_TABLES.map((t) => [t, [] as Row[]])) as ExportSnapshot;
  const row = (id: string, more: Row = {}): Row => ({ id, space_id: "s1", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", deleted_at: null, ...more });
  return { ...empty, projects: [row("p1", { name: "Acme launch", state: "active" })], tasks: [row("t1", { title: "Draft the proposal", state: "active", project_id: "p1" })] };
};

describe("exportParts", () => {
  it("is one text for JSON and CSV, named and typed for what it is", () => {
    const json = exportParts("json", snapshot(), NOW);
    expect(json).toMatchObject({ name: "sparehour-export-2026-11-22.json", type: "application/json" });
    expect("text" in json && JSON.parse(json.text).exported_at).toBe("2026-11-22T10:00:00.000Z");
    const csv = exportParts("csv", snapshot(), NOW);
    expect(csv).toMatchObject({ name: "sparehour-tasks-2026-11-22.csv", type: "text/csv" });
    expect("text" in csv && csv.text).toContain("Draft the proposal");
  });

  it("is the files to zip for Markdown, one per project", () => {
    const markdown = exportParts("markdown", snapshot(), NOW);
    expect(markdown).toMatchObject({ name: "sparehour-markdown-2026-11-22.zip", type: "application/zip" });
    expect("files" in markdown && markdown.files.some((f) => /acme-launch/.test(f.path))).toBe(true);
  });

  it("says in the file when finished tasks could not be fetched", () => {
    const json = exportParts("json", snapshot(), NOW, { finishedTasks: false });
    expect("text" in json && JSON.parse(json.text).finished_tasks_included).toBe(false);
  });
});
