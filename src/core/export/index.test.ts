import { describe, expect, it } from "vitest";
import { csvCell, csvExport, jsonExport, markdownFiles, slug, type ExportSnapshot } from "./index";

const snapshot: ExportSnapshot = {
  areas: [{ id: "a1", name: "Work", sort_key: "a0" }],
  projects: [
    { id: "p1", area_id: "a1", name: "Acme proposal", notes_md: "Why: renewal in Q4.", state: "active", deadline: "2026-10-01", sort_key: "a0" },
    { id: "p2", area_id: null, name: "Acme proposal", notes_md: null, state: "someday", deadline: null, sort_key: "a1" },
  ],
  headings: [{ id: "h1", project_id: "p1", title: "Research", sort_key: "a0" }],
  tasks: [
    { id: "t1", project_id: "p1", heading_id: null, title: "Draft the proposal", notes_md: "Two pages,\nno more.", state: "active", priority: 3, do_date: "2026-09-14", do_time: "09:30:00", evening: 0, deadline: "2026-09-20", start_date: null, estimate_min: 45, carry_count: 1, recurrence_rule: null, sort_key: "a0", created_at: "2026-09-10T08:00:00Z", completed_at: null },
    { id: "t2", project_id: "p1", heading_id: "h1", title: "Read last year's, \"quickly\"", notes_md: null, state: "active", priority: 0, do_date: null, do_time: null, evening: 1, deadline: null, start_date: null, estimate_min: null, carry_count: 0, recurrence_rule: "FREQ=WEEKLY;BYDAY=MO", sort_key: "a0", created_at: "2026-09-11T08:00:00Z", completed_at: null },
    { id: "t3", project_id: "p1", heading_id: null, title: "Kick-off call", notes_md: null, state: "done", priority: 0, do_date: "2026-09-10", do_time: null, evening: 0, deadline: null, start_date: null, estimate_min: 30, carry_count: 0, recurrence_rule: null, sort_key: "a1", created_at: "2026-09-09T08:00:00Z", completed_at: "2026-09-10T10:00:00Z" },
    { id: "t4", project_id: null, heading_id: null, title: "Call Mum", notes_md: null, state: "inbox", priority: 0, do_date: null, do_time: null, evening: 0, deadline: null, start_date: null, estimate_min: null, carry_count: 0, recurrence_rule: null, sort_key: "a2", created_at: "2026-09-12T08:00:00Z", completed_at: null },
    { id: "t5", project_id: null, heading_id: null, title: "Learn Welsh", notes_md: null, state: "someday", priority: 0, do_date: null, do_time: null, evening: 0, deadline: null, start_date: null, estimate_min: null, carry_count: 0, recurrence_rule: null, sort_key: "a3", created_at: "2026-09-12T08:00:00Z", completed_at: null },
  ],
  checklist_items: [
    { id: "c2", task_id: "t1", title: "Outline", done: 1, sort_key: "a0" },
    { id: "c1", task_id: "t1", title: "Numbers", done: 0, sort_key: "a1" },
  ],
  tags: [
    { id: "g1", name: "deep" },
    { id: "g2", name: "writing" },
  ],
  task_tags: [
    { id: "l1", task_id: "t1", tag_id: "g2" },
    { id: "l2", task_id: "t1", tag_id: "g1" },
  ],
  time_blocks: [{ id: "b1", task_id: "t1", title: null, start_at: "2026-09-14T09:30:00Z", end_at: "2026-09-14T10:15:00Z", locked: 1 }],
  day_plans: [{ id: "d1", date: "2026-09-13", planned_at: "2026-09-13T08:05:00Z", shutdown_at: "2026-09-13T17:40:00Z", highlights: "Shipped the thing.", day_rating: 4, capacity_spare_min: 80 }],
  work_hours: [{ id: "w1", weekday: 0, start_time: "09:00:00", end_time: "18:00:00" }],
  user_settings: [{ id: "s1", timezone: "Europe/London", buffer_pct: 15 }],
};

describe("jsonExport", () => {
  it("is the rows as stored, with a format stamp, and parses back", () => {
    const out = JSON.parse(jsonExport(snapshot, "2026-09-14T12:00:00Z"));
    expect(out).toMatchObject({ format: "sparehour-export", version: 1, exported_at: "2026-09-14T12:00:00Z" });
    expect(out.tables.tasks).toEqual(snapshot.tasks);
    expect(Object.keys(out.tables)).toEqual(["areas", "projects", "headings", "tasks", "checklist_items", "tags", "task_tags", "time_blocks", "day_plans", "work_hours", "user_settings"]);
  });
});

describe("csvExport", () => {
  it("quotes what needs quoting and leaves nulls empty", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", now')).toBe('"say ""hi"", now"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(0)).toBe("0");
  });

  it("is one flat row per task with names instead of ids, tags joined, in list order", () => {
    const lines = csvExport(snapshot).split("\r\n");
    expect(lines[0]).toBe("id,title,state,area,project,heading,do_date,do_time,evening,deadline,start_date,estimate_min,priority,tags,carry_count,notes,created_at,completed_at");
    expect(lines[1]).toBe('t1,Draft the proposal,active,Work,Acme proposal,,2026-09-14,09:30,false,2026-09-20,,45,3,deep writing,1,"Two pages,\nno more.",2026-09-10T08:00:00Z,');
    expect(lines[2]).toBe('t2,"Read last year\'s, ""quickly""",active,Work,Acme proposal,Research,,,true,,,,0,,0,,2026-09-11T08:00:00Z,');
    expect(lines).toHaveLength(7);
    expect(lines[6]).toBe("");
  });
});

describe("markdownFiles", () => {
  const files = markdownFiles(snapshot, "2026-09-14");
  const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));

  it("makes one file per project, two projects with one name get distinct files, and the index links them", () => {
    expect(Object.keys(byPath)).toEqual(["README.md", "projects/acme-proposal.md", "projects/acme-proposal-2.md", "inbox.md", "today-and-upcoming.md", "someday.md", "logbook.md", "time-blocks.md", "day-plans.md"]);
    expect(byPath["README.md"]).toContain("## Work");
    expect(byPath["README.md"]).toContain("- [Acme proposal](projects/acme-proposal.md)");
    expect(byPath["README.md"]).toContain("## No area");
    expect(byPath["README.md"]).toContain("(projects/acme-proposal-2.md)");
    expect(slug("Ünïcode & Spaces!!")).toBe("unicode-spaces");
    expect(slug("")).toBe("untitled");
  });

  it("a project file reads like a plan: meta, notes, loose tasks, headings, then Done", () => {
    const md = byPath["projects/acme-proposal.md"];
    expect(md.startsWith("# Acme proposal\n\nArea: Work · Deadline: 2026-10-01\n\nWhy: renewal in Q4.\n\n")).toBe(true);
    expect(md).toContain("- [ ] Draft the proposal · do 2026-09-14 09:30 · due 2026-09-20 · 45m · !1 · @deep · @writing\n    Two pages,\n    no more.\n    - [x] Outline\n    - [ ] Numbers");
    expect(md).toContain("## Research\n\n- [ ] Read last year's, \"quickly\" · repeats FREQ=WEEKLY;BYDAY=MO");
    expect(md).toContain("## Done\n\n- [x] Kick-off call · do 2026-09-10 · 30m");
    expect(md).not.toContain("## Someday");
    expect(byPath["projects/acme-proposal-2.md"]).toContain("State: someday");
  });

  it("tasks without a project land in the inbox, Someday and logbook files; blocks and day plans have their own", () => {
    expect(byPath["inbox.md"]).toContain("- [ ] Call Mum");
    expect(byPath["someday.md"]).toContain("- [ ] Learn Welsh");
    expect(byPath["logbook.md"]).toContain("_Nothing here._");
    expect(byPath["time-blocks.md"]).toContain("- 2026-09-14T09:30:00Z – 2026-09-14T10:15:00Z · Draft the proposal · locked");
    expect(byPath["day-plans.md"]).toContain("- **2026-09-13** · planned 08:05 · closed 17:40 · ★★★★ · 80m spare\n    Shipped the thing.");
  });
});
