import { unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { buildExport, readSnapshot } from "./use-export";

describe("readSnapshot", () => {
  it("reads every exported table, leaving out soft-deleted rows where the table has them", async () => {
    const getAll = vi.fn(async (sql: string) => [{ id: sql }]);
    const snapshot = await readSnapshot(getAll as never);
    const sqls = getAll.mock.calls.map((c) => c[0]);
    expect(sqls).toContain("select * from tasks where deleted_at is null");
    expect(sqls).toContain("select * from user_settings");
    expect(sqls).toHaveLength(11);
    expect(snapshot.tasks).toEqual([{ id: "select * from tasks where deleted_at is null" }]);
  });
});

describe("buildExport", () => {
  const snapshot = { areas: [], projects: [], headings: [], tasks: [{ id: "t1", title: "Call Mum", state: "inbox", sort_key: "a0" }], checklist_items: [], tags: [], task_tags: [], time_blocks: [], day_plans: [], work_hours: [], user_settings: [] };
  const now = new Date("2026-09-14T12:00:00Z");

  it("names the files by the day and gives each its type", async () => {
    const json = buildExport("json", snapshot, now);
    expect(json.name).toBe("sparehour-export-2026-09-14.json");
    expect(json.blob.type).toBe("application/json");
    expect(JSON.parse(await json.blob.text()).tables.tasks[0].title).toBe("Call Mum");
    const csv = buildExport("csv", snapshot, now);
    expect(csv.name).toBe("sparehour-tasks-2026-09-14.csv");
    expect(await csv.blob.text()).toContain("t1,Call Mum,inbox");
  });

  it("the Markdown export is a zip with one file per list", async () => {
    const md = buildExport("markdown", snapshot, now);
    expect(md.name).toBe("sparehour-markdown-2026-09-14.zip");
    const files = unzipSync(new Uint8Array(await md.blob.arrayBuffer()));
    expect(Object.keys(files)).toContain("README.md");
    expect(Object.keys(files)).toContain("inbox.md");
    expect(new TextDecoder().decode(files["inbox.md"])).toContain("- [ ] Call Mum");
  });
});
