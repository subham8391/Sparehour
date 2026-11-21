// An export as the phone hands it over: the web's own builders, one piece of text per format.
import { EXPORT_TABLES, type ExportSnapshot, type Row } from "@/core/export";
import { exportText } from "./export-text";

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

describe("exportText", () => {
  it("names each format as the web does, and Markdown as one text where the web has a zip", () => {
    expect(exportText("json", snapshot(), NOW).name).toBe("sparehour-export-2026-11-22.json");
    expect(exportText("csv", snapshot(), NOW).name).toBe("sparehour-tasks-2026-11-22.csv");
    expect(exportText("markdown", snapshot(), NOW).name).toBe("sparehour-markdown-2026-11-22.md");
  });

  it("JSON is the web's complete export, and says when finished tasks could not be fetched", () => {
    const whole = JSON.parse(exportText("json", snapshot(), NOW, { finishedTasks: true }).text);
    expect(whole).toMatchObject({ format: "sparehour-export", version: 1, exported_at: "2026-11-22T10:00:00.000Z", finished_tasks_included: true });
    expect(whole.tables.tasks).toHaveLength(2);
    expect(JSON.parse(exportText("json", snapshot(), NOW, { finishedTasks: false }).text).finished_tasks_included).toBe(false);
  });

  it("CSV is the flat task table", () => {
    const lines = exportText("csv", snapshot(), NOW).text.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("title");
    expect(lines.join("\n")).toContain("Draft the proposal");
  });

  it("Markdown is every file the web would zip, one after another, each under its path", () => {
    const { text } = exportText("markdown", snapshot(), NOW);
    const paths = [...text.matchAll(/^<!-- (.+) -->$/gm)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThanOrEqual(3);
    expect(paths.some((p) => p.includes("acme-launch"))).toBe(true);
    expect(text).toContain("Draft the proposal");
    expect(text.split("\n---\n")).toHaveLength(paths.length);
  });
});
