// Adversarial tests for the export: JSON round trips of awkward cells, CSV
// escaping under an RFC 4180 reader, Markdown with titles that look like
// syntax, slug collisions and path safety, and row ordering.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { keyBetween, sorted } from "../ordering";
import { csvCell, csvExport, jsonExport, markdownFiles, slug, type ExportSnapshot, type Row } from "./index";

const empty = (): ExportSnapshot => ({
  areas: [],
  projects: [],
  headings: [],
  tasks: [],
  checklist_items: [],
  tags: [],
  task_tags: [],
  task_completions: [],
  recurrence_exceptions: [],
  time_blocks: [],
  day_plans: [],
  work_hours: [],
  user_settings: [],
});
const taskRow = (id: string, over: Row = {}): Row => ({ id, project_id: null, heading_id: null, title: id, notes_md: null, state: "active", priority: 0, do_date: null, do_time: null, evening: 0, deadline: null, start_date: null, estimate_min: null, carry_count: 0, recurrence_rule: null, sort_key: "a0", created_at: null, completed_at: null, ...over });

/** A small RFC 4180 reader: CRLF rows, quoted fields with doubled quotes and embedded newlines. */
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

describe("jsonExport", () => {
  it("round-trips every cell type the snapshot can hold, including unicode, quotes, newlines and big numbers", () => {
    const s = empty();
    s.tasks.push(taskRow("t1", { title: 'say "hi",\r\nnow 🎉 日本語  ', notes_md: "a\\b\tc\0d", estimate_min: 9007199254740991, priority: -0, carry_count: 1e21 }));
    s.user_settings.push({ id: "s", timezone: "Europe/London", buffer_pct: 15.5 });
    const out = JSON.parse(jsonExport(s, "2026-09-14T12:00:00Z")) as { tables: ExportSnapshot };
    expect(out.tables).toEqual({ ...s, tasks: [{ ...s.tasks[0], priority: 0 }] });
  });

  it("keeps the table order stable and includes empty tables", () => {
    const out = JSON.parse(jsonExport(empty(), "x")) as { tables: Record<string, unknown[]> };
    expect(Object.keys(out.tables)).toEqual(["areas", "projects", "headings", "tasks", "checklist_items", "tags", "task_tags", "task_completions", "recurrence_exceptions", "time_blocks", "day_plans", "work_hours", "user_settings"]);
    expect(Object.values(out.tables).every((t) => t.length === 0)).toBe(true);
  });
});

describe("csvExport", () => {
  it("csvCell escapes exactly what RFC 4180 needs and nothing else", () => {
    expect(csvCell("a\rb")).toBe('"a\rb"');
    expect(csvCell("a\r\nb")).toBe('"a\r\nb"');
    expect(csvCell('"')).toBe('""""');
    expect(csvCell(" leading and trailing ")).toBe(" leading and trailing ");
    expect(csvCell("semi;colon\ttab")).toBe("semi;colon\ttab");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(false)).toBe("false");
    expect(csvCell(-0)).toBe("0");
    expect(csvCell(NaN)).toBe("NaN");
  });

  it("documents: cells starting with =, +, -, @ are not neutralised (spreadsheet formula injection)", () => {
    expect(csvCell("=1+1")).toBe("=1+1");
    expect(csvCell("@SUM(A1)")).toBe("@SUM(A1)");
  });

  it("every row has 18 cells and the title and notes come back byte-identical through an RFC 4180 reader", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 40 }), fc.string({ unit: "grapheme", maxLength: 40 }), (title, notes) => {
        const s = empty();
        s.tasks.push(taskRow("t1", { title, notes_md: notes }));
        const rows = readCsv(csvExport(s));
        expect(rows).toHaveLength(2);
        expect(rows[1]).toHaveLength(18);
        expect(rows[1][1]).toBe(title);
        expect(rows[1][15]).toBe(notes);
      }),
      { numRuns: 300 },
    );
  });

  it("an empty export is just the header line", () => {
    expect(csvExport(empty())).toBe("id,title,state,area,project,heading,do_date,do_time,evening,deadline,start_date,estimate_min,priority,tags,carry_count,notes,created_at,completed_at\r\n");
  });

  it("orders tasks by sort_key the way the ordering module does (byte order, not locale order)", () => {
    const front = keyBetween(null, "a0");
    const s = empty();
    s.tasks.push(taskRow("mid", { sort_key: "a0" }), taskRow("first", { sort_key: front }), taskRow("last", { sort_key: "a1" }));
    const expected = sorted(s.tasks.map((t) => ({ id: String(t.id), sortKey: String(t.sort_key) }))).map((x) => x.id);
    const got = readCsv(csvExport(s)).slice(1).map((r) => r[0]);
    expect(got).toEqual(expected);
  });

  it("tags: duplicates in task_tags are repeated, links to missing tags are dropped, names sort", () => {
    const s = empty();
    s.tags.push({ id: "g1", name: "zeta" }, { id: "g2", name: "alpha" });
    s.task_tags.push({ id: "l1", task_id: "t1", tag_id: "g1" }, { id: "l2", task_id: "t1", tag_id: "g2" }, { id: "l3", task_id: "t1", tag_id: "g2" }, { id: "l4", task_id: "t1", tag_id: "missing" });
    s.tasks.push(taskRow("t1"));
    expect(readCsv(csvExport(s))[1][13]).toBe("alpha alpha zeta");
  });

  it("evening and do_time render only for the stored shapes (1 and HH:MM:SS)", () => {
    const s = empty();
    s.tasks.push(taskRow("t1", { evening: 1, do_time: "9:30" }), taskRow("t2", { evening: "true", do_time: "09:30:00" }));
    const rows = readCsv(csvExport(s));
    expect([rows[1][7], rows[1][8]]).toEqual(["9:30", "true"]);
    expect([rows[2][7], rows[2][8]]).toEqual(["09:30", "false"]);
  });
});

describe("markdownFiles", () => {
  const files = (s: ExportSnapshot) => Object.fromEntries(markdownFiles(s, "2026-09-14").map((f) => [f.path, f.content]));

  it("an empty snapshot still produces the index and the six fixed files", () => {
    const f = files(empty());
    expect(Object.keys(f)).toEqual(["README.md", "inbox.md", "today-and-upcoming.md", "someday.md", "logbook.md", "time-blocks.md", "day-plans.md"]);
    expect(f["README.md"]).toContain("0 tasks, 0 projects, 0 areas.");
    expect(f["inbox.md"]).toBe("# Inbox\n\n_Nothing here._\n");
    expect(f["time-blocks.md"]).toBe("# Time blocks\n\n_None._\n");
  });

  it("documents: titles are written raw, so `#`, `[`, `*` and a newline in a title reach the Markdown as-is", () => {
    const s = empty();
    s.tasks.push(taskRow("t1", { title: "# not a heading [x](y) *emph* <b>", state: "inbox" }), taskRow("t2", { title: "two\nlines", state: "inbox", sort_key: "a1" }));
    const md = files(s)["inbox.md"];
    expect(md).toContain("- [ ] # not a heading [x](y) *emph* <b>");
    expect(md).toContain("- [ ] two\nlines"); // the second line is no longer part of the list item
  });

  it("slug: unicode-only, dash-only and traversal-like names are safe, and collisions are numbered", () => {
    expect(slug("日本語")).toBe("untitled");
    expect(slug("--")).toBe("untitled");
    expect(slug("../../etc/passwd")).toBe("etcpasswd");
    expect(slug("a--b__c  d")).toBe("a-b-c-d");
    expect(slug("Ünïcode & Spaces!!")).toBe("unicode-spaces");
    expect(slug(null, "x")).toBe("x");
    expect(slug(undefined)).toBe("untitled");
    const s = empty();
    s.projects.push({ id: "p1", area_id: null, name: "日本語", state: "active", sort_key: "a0" }, { id: "p2", area_id: null, name: "--", state: "active", sort_key: "a1" }, { id: "p3", area_id: null, name: "README", state: "active", sort_key: "a2" }, { id: "p4", area_id: null, name: "", state: "active", sort_key: "a3" });
    const paths = Object.keys(files(s));
    expect(paths).toContain("projects/untitled.md");
    expect(paths).toContain("projects/untitled-2.md");
    expect(paths).toContain("projects/untitled-3.md");
    expect(paths).toContain("projects/readme.md");
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("documents: a very long project name is not truncated, giving a path longer than most file systems allow", () => {
    const s = empty();
    s.projects.push({ id: "p1", area_id: null, name: "x".repeat(300), state: "active", sort_key: "a0" });
    const path = Object.keys(files(s)).find((p) => p.startsWith("projects/"))!;
    expect(path.length).toBeGreaterThan(255);
  });

  it("a task under a heading of another project is loose; an empty heading says so; null names fall back", () => {
    const s = empty();
    s.projects.push({ id: "p1", area_id: "missing", name: null, state: "active", sort_key: "a0", deadline: null, notes_md: null }, { id: "p2", area_id: null, name: "Other", state: "done", sort_key: "a1" });
    s.headings.push({ id: "h1", project_id: "p1", title: null, sort_key: "a0" }, { id: "h2", project_id: "p2", title: "Elsewhere", sort_key: "a0" });
    s.tasks.push(taskRow("t1", { project_id: "p1", heading_id: "h2", title: null }), taskRow("t2", { project_id: "p1", state: "archived", sort_key: "a1" }), taskRow("t3", { project_id: "ghost", state: "done", sort_key: "a2", completed_at: "2026-09-01T00:00:00Z" }));
    const f = files(s);
    const p1 = f["projects/untitled.md"];
    expect(p1.startsWith("# Untitled project\n\n- [ ] \n\n## Untitled heading\n\n_Nothing here._\n")).toBe(true);
    expect(p1).toContain("## Dropped\n\n- [ ] t2");
    expect(f["projects/other.md"]).toContain("State: done");
    expect(f["logbook.md"]).toContain("- [x] t3"); // a task of an unknown project is loose
    expect(f["README.md"]).toContain("## No area\n\n- [Untitled project](projects/untitled.md)\n- [Other](projects/other.md)");
  });

  it("task chips: priority maps back to !N, zero estimate and rating are omitted, notes and steps indent, CRLF notes keep their CR", () => {
    const s = empty();
    s.tasks.push(taskRow("t1", { priority: 3, estimate_min: 0, notes_md: "one\r\ntwo", do_date: "2026-09-14", do_time: "09:30:00", evening: 1, deadline: "2026-09-20", recurrence_rule: "FREQ=DAILY" }));
    s.checklist_items.push({ id: "c1", task_id: "t1", title: null, done: 1, sort_key: "a0" }, { id: "c0", task_id: "t1", title: "b", done: 0, sort_key: "Zz" });
    s.day_plans.push({ id: "d1", date: "2026-09-13", planned_at: null, shutdown_at: null, highlights: "  multi\nline  ", day_rating: 0, capacity_spare_min: 0 });
    s.time_blocks.push({ id: "b1", task_id: "missing", title: null, start_at: "2026-09-14T09:30:00Z", end_at: "2026-09-14T10:15:00Z", locked: 0 });
    const f = files(s);
    // Steps follow their keys by code unit: "Zz" sorts before "a0", exactly as the app orders them.
    expect(f["today-and-upcoming.md"]).toContain("- [ ] t1 · do 2026-09-14 09:30 (evening) · due 2026-09-20 · !1 · repeats FREQ=DAILY\n    one\r\n    two\n    - [ ] b\n    - [x] \n");
    expect(f["day-plans.md"]).toContain("- **2026-09-13** · 0m spare\n    multi\n    line\n");
    expect(f["time-blocks.md"]).toContain("- 2026-09-14T09:30:00Z – 2026-09-14T10:15:00Z · Block\n");
  });

  it("orders project tasks by sort_key in byte order like the ordering module", () => {
    const front = keyBetween(null, "a0");
    const s = empty();
    s.projects.push({ id: "p1", area_id: null, name: "P", state: "active", sort_key: "a0" });
    s.tasks.push(taskRow("mid", { project_id: "p1", sort_key: "a0" }), taskRow("first", { project_id: "p1", sort_key: front }));
    const md = files(s)["projects/p.md"];
    const expected = sorted([{ id: "mid", sortKey: "a0" }, { id: "first", sortKey: front }]).map((x) => `- [ ] ${x.id}`);
    expect(md.split("\n").filter((l) => l.startsWith("- [ ] "))).toEqual(expected);
  });
});
