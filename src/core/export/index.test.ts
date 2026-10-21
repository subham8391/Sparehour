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
  task_completions: [
    { id: "k1", task_id: "t2", occurrence_date: "2026-09-07", completed_at: "2026-09-07T09:00:00Z", actual_min: null },
    { id: "k2", task_id: "t2", occurrence_date: "2026-09-14", completed_at: "2026-09-14T09:10:00Z", actual_min: 20 },
  ],
  recurrence_exceptions: [
    { id: "x2", series_id: "t2", occurrence_date: "2026-09-28", kind: "move", moved_to: "2026-09-29" },
    { id: "x1", series_id: "t2", occurrence_date: "2026-09-21", kind: "skip", moved_to: null },
  ],
  time_blocks: [{ id: "b1", task_id: "t1", title: null, start_at: "2026-09-14T09:30:00Z", end_at: "2026-09-14T10:15:00Z", locked: 1 }],
  day_plans: [{ id: "d1", date: "2026-09-13", planned_at: "2026-09-13T08:05:00Z", shutdown_at: "2026-09-13T17:40:00Z", highlights: "Shipped the thing.", day_rating: 4, capacity_spare_min: 80 }],
  work_hours: [{ id: "w1", weekday: 0, start_time: "09:00:00", end_time: "18:00:00" }],
  user_settings: [{ id: "s1", timezone: "Europe/London", buffer_pct: 15 }],
  lists: [
    { id: "L2", parent_id: "L1", name: "Action", emoji: null, sort_key: "a0" },
    { id: "L1", parent_id: null, name: "Anime", emoji: "🍥", sort_key: "a0" },
    { id: "L3", parent_id: null, name: "Books", emoji: null, sort_key: "a1" },
  ],
  list_items: [
    { id: "i2", list_id: "L2", title: "Jujutsu Kaisen", note_md: null, url: null, status: "doing", rating: null, sort_key: "a1" },
    { id: "i1", list_id: "L2", title: "Attack on Titan", note_md: "Rewatch the last season.", url: "https://example.com/aot", status: "done", rating: 5, sort_key: "a0" },
    { id: "i3", list_id: "L1", title: "Frieren", note_md: null, url: null, status: "todo", rating: null, sort_key: "a0" },
  ],
  list_item_tags: [{ id: "k1", item_id: "i1", tag_id: "g1" }],
};

describe("jsonExport", () => {
  it("is the rows as stored, with a format stamp, and parses back", () => {
    const out = JSON.parse(jsonExport(snapshot, "2026-09-14T12:00:00Z"));
    expect(out).toMatchObject({ format: "sparehour-export", version: 1, exported_at: "2026-09-14T12:00:00Z", finished_tasks_included: true });
    expect(out.tables.tasks).toEqual(snapshot.tasks);
    expect(Object.keys(out.tables)).toEqual(["areas", "projects", "headings", "tasks", "checklist_items", "tags", "task_tags", "task_completions", "recurrence_exceptions", "time_blocks", "day_plans", "work_hours", "user_settings", "lists", "list_items", "list_item_tags"]);
  });

  it("carries the completions and exceptions of repeating tasks, and says when finished tasks are missing", () => {
    const out = JSON.parse(jsonExport(snapshot, "2026-09-14T12:00:00Z"));
    expect(out.tables.task_completions).toEqual(snapshot.task_completions);
    expect(out.tables.recurrence_exceptions).toEqual(snapshot.recurrence_exceptions);
    expect(JSON.parse(jsonExport(snapshot, "x", { finishedTasks: false })).finished_tasks_included).toBe(false);
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
    expect(Object.keys(byPath)).toEqual(["README.md", "projects/acme-proposal.md", "projects/acme-proposal-2.md", "inbox.md", "today-and-upcoming.md", "someday.md", "logbook.md", "time-blocks.md", "day-plans.md", "lists/anime.md", "lists/books.md"]);
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

  it("a repeating task lists its skipped and moved occurrences in date order", () => {
    expect(byPath["projects/acme-proposal.md"]).toContain('- [ ] Read last year\'s, "quickly" · repeats FREQ=WEEKLY;BYDAY=MO\n    - skipped 2026-09-21\n    - moved 2026-09-28 → 2026-09-29');
  });

  it("the logbook keeps every completed occurrence of a repeating task, newest first, with its project", () => {
    const md = byPath["logbook.md"];
    expect(md).not.toContain("_Nothing here._");
    expect(md).toContain("## Repeating tasks\n\n- [x] Read last year's, \"quickly\" · 2026-09-14 · #Acme proposal · 20m\n- [x] Read last year's, \"quickly\" · 2026-09-07 · #Acme proposal\n");
  });

  it("an export without the finished tasks says so in the index and the logbook", () => {
    const partial = Object.fromEntries(markdownFiles(snapshot, "2026-09-14", { finishedTasks: false }).map((f) => [f.path, f.content]));
    expect(partial["README.md"]).toContain("Finished tasks are not in this export");
    expect(partial["logbook.md"]).toContain("Finished tasks are not in this export");
    expect(byPath["README.md"]).not.toContain("Finished tasks are not in this export");
  });

  it("tasks without a project land in the inbox, Someday and logbook files; blocks and day plans have their own", () => {
    expect(byPath["inbox.md"]).toContain("- [ ] Call Mum");
    expect(byPath["someday.md"]).toContain("- [ ] Learn Welsh");
    expect(markdownFiles({ ...snapshot, task_completions: [] }, "2026-09-14").find((f) => f.path === "logbook.md")?.content).toContain("_Nothing here._");
    expect(byPath["time-blocks.md"]).toContain("- 2026-09-14T09:30:00Z – 2026-09-14T10:15:00Z · Draft the proposal · locked");
    expect(byPath["day-plans.md"]).toContain("- **2026-09-13** · planned 08:05 · closed 17:40 · ★★★★ · 80m spare\n    Shipped the thing.");
  });
});

describe("lists in the Markdown export (DECISIONS.md, amendment 2026-10-22)", () => {
  it("one file per top-level list, the lists inside as headings, each item with its status, stars, link, tags and note", () => {
    const files = Object.fromEntries(markdownFiles(snapshot, "2026-10-22T12:00:00Z").map((f) => [f.path, f.content]));
    expect(files["lists/anime.md"]).toBe(
      ["# 🍥 Anime", "", "- [ ] Frieren", "", "## Action", "", "- [x] Attack on Titan · ★★★★★ · https://example.com/aot · @deep", "    Rewatch the last season.", "- [ ] Jujutsu Kaisen · doing", ""].join("\n"),
    );
    expect(files["lists/books.md"]).toBe("# Books\n");
    expect(files["README.md"]).toContain("## Lists\n\n- [Anime](lists/anime.md)\n- [Books](lists/books.md)\n");
  });
});
