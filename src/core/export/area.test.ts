import { describe, expect, it } from "vitest";
import { csvExport, markdownFiles, type ExportSnapshot } from "./index";

const snapshot: ExportSnapshot = {
  areas: [{ id: "a1", name: "Home", sort_key: "a0" }],
  projects: [{ id: "p1", area_id: "a1", name: "Kitchen", state: "active", sort_key: "a0" }],
  headings: [],
  tasks: [
    { id: "t1", project_id: null, area_id: "a1", heading_id: null, title: "Renew passport", state: "active", priority: 0, evening: 0, carry_count: 0, sort_key: "a0", created_at: "2026-10-07T08:00:00Z" },
    { id: "t2", project_id: "p1", area_id: null, heading_id: null, title: "Order tiles", state: "active", priority: 0, evening: 0, carry_count: 0, sort_key: "a1", created_at: "2026-10-07T08:00:00Z" },
  ],
  checklist_items: [],
  tags: [],
  task_tags: [],
  task_completions: [],
  recurrence_exceptions: [],
  time_blocks: [],
  day_plans: [],
  work_hours: [],
  user_settings: [],
};

describe("csvExport and tasks filed in an area", () => {
  it("names a loose task's own area, and a project task's project's area", () => {
    const lines = csvExport(snapshot).split("\r\n");
    expect(lines[1]).toMatch(/^t1,Renew passport,active,Home,,/);
    expect(lines[2]).toMatch(/^t2,Order tiles,active,Home,Kitchen,/);
  });
});

describe("markdownFiles and tasks filed in an area", () => {
  it("a loose task names its area in the list file it lands in; a project task does not repeat its project's", () => {
    const files = markdownFiles(snapshot, "2026-10-07T09:00:00Z");
    expect(files.find((f) => f.path === "today-and-upcoming.md")?.content).toContain("- [ ] Renew passport · area Home");
    expect(files.find((f) => f.path.startsWith("projects/"))?.content).toContain("- [ ] Order tiles\n");
  });
});
