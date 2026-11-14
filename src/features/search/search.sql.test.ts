// Search's statements run against a local database (PRODUCT_SPEC.md §15): every word matches somewhere in the
// task, archived tasks stay out unless asked for, results rank by recency then relevance, the area chip takes in
// tasks filed in the area directly, and 5,000 tasks are searched well inside 100 ms.
import { describe, expect, it } from "vitest";
import { localSqlite, type Row } from "@/test/local-sqlite";
import { buildChecklistMatch, buildTaskSearch, type SearchFilters } from "./search";

type Db = ReturnType<typeof localSqlite>;

function task(db: Db, id: string, row: Row) {
  db.insert("tasks", { id, space_id: "s1", title: id, state: "active", sort_key: id, carry_count: 0, last_touched_at: "2026-10-01 09:00:00+00", ...row });
}

function seed(): Db {
  const db = localSqlite();
  db.insert("projects", { id: "p1", space_id: "s1", area_id: "a1", name: "Acme", state: "active", sort_key: "a0" });
  task(db, "title", { title: "Draft the Acme proposal" });
  task(db, "reversed", { title: "Proposal for ACME" });
  task(db, "split", { title: "Acme kickoff", notes_md: null });
  db.insert("checklist_items", { id: "c1", space_id: "s1", task_id: "split", title: "send the proposal", done: 0, sort_key: "a0" });
  task(db, "notes", { title: "Weekly sync", notes_md: "Talk about the Acme proposal" });
  task(db, "one-word", { title: "Acme invoice" });
  task(db, "archived", { title: "Old Acme proposal", state: "archived" });
  task(db, "done", { title: "Acme proposal v1", state: "done", completed_at: "2026-09-20T10:00:00.000Z" });
  task(db, "deleted", { title: "Acme proposal draft", deleted_at: "2026-10-01T00:00:00.000Z" });
  return db;
}

const run = (db: Db, query: string, filters: SearchFilters = {}) => {
  const s = buildTaskSearch(query, filters);
  return s ? db.rows(s.sql, s.params).map((r) => r.id) : [];
};

describe("multi-word search", () => {
  it("finds tasks holding every word, in any order and any case, across title, notes and steps", () => {
    expect(new Set(run(seed(), "acme proposal"))).toEqual(new Set(["title", "reversed", "split", "notes", "done"]));
  });
  it("a single word still matches as before; extra spaces change nothing", () => {
    expect(run(seed(), "  invoice  ")).toEqual(["one-word"]);
  });
  it("finds the steps holding any word, for the context line", () => {
    const db = seed();
    const s = buildChecklistMatch("acme proposal")!;
    expect(db.rows(s.sql, s.params)).toEqual([{ task_id: "split", title: "send the proposal" }]);
    expect(buildChecklistMatch("   ")).toBeNull();
  });
});

describe("archived tasks", () => {
  it("stay out of a search unless the state chip is Archived", () => {
    const db = seed();
    expect(run(db, "acme")).not.toContain("archived");
    expect(run(db, "acme", { state: "archived" })).toEqual(["archived"]);
  });
});

describe("ranking: recency, then relevance", () => {
  it("the most recently touched day first; within a day a title with every word, then some, then notes or steps", () => {
    const db = localSqlite();
    task(db, "old-title", { title: "Acme proposal", last_touched_at: "2026-09-01 09:00:00+00" });
    task(db, "today-notes", { title: "Sync", notes_md: "acme proposal", last_touched_at: "2026-10-07T11:00:00.000Z" });
    task(db, "today-some", { title: "Acme call", notes_md: "the proposal", last_touched_at: "2026-10-07 07:00:00+00" });
    task(db, "today-all", { title: "The Acme proposal", last_touched_at: "2026-10-07T06:00:00.000Z" });
    task(db, "today-all-later", { title: "Proposal to Acme", last_touched_at: "2026-10-07T09:30:00.000Z" });
    expect(run(db, "acme proposal")).toEqual(["today-all-later", "today-all", "today-some", "today-notes", "old-title"]);
  });
  it("falls back to the last write when a task has no touch", () => {
    const db = localSqlite();
    task(db, "a", { title: "Acme", last_touched_at: null, updated_at: "2026-10-05T00:00:00.000Z" });
    task(db, "b", { title: "Acme", last_touched_at: null, updated_at: "2026-10-06T00:00:00.000Z" });
    expect(run(db, "acme")).toEqual(["b", "a"]);
  });
});

describe("the area chip", () => {
  it("takes in tasks filed in the area directly as well as those in its projects", () => {
    const db = localSqlite();
    db.insert("projects", { id: "p1", space_id: "s1", area_id: "a1", name: "Q4", state: "active", sort_key: "a0" });
    db.insert("projects", { id: "p2", space_id: "s1", area_id: "a2", name: "Kitchen", state: "active", sort_key: "a0" });
    task(db, "in-project", { title: "Plan", project_id: "p1" });
    task(db, "loose", { title: "Plan B", area_id: "a1" });
    task(db, "elsewhere", { title: "Plan C", project_id: "p2" });
    task(db, "unfiled", { title: "Plan D" });
    expect(new Set(run(db, "plan", { area: "a1" }))).toEqual(new Set(["in-project", "loose"]));
    expect(new Set(run(db, "", { area: "a1" }))).toEqual(new Set(["in-project", "loose"]));
  });
});

describe("speed", () => {
  it("searches 5,000 tasks with notes and steps in under 100 ms", () => {
    const db = localSqlite();
    // The device's tables carry an index on checklist_items.task_id (schema.client.ts); so does this stand-in.
    void db.db.execute("create index checklist_task on checklist_items (task_id)");
    const words = ["draft", "review", "call", "plan", "send", "book", "fix", "write", "ship", "check"];
    const things = ["proposal", "invoice", "deck", "budget", "roadmap", "contract", "brief", "report", "agenda", "plan"];
    for (let i = 0; i < 5000; i++) {
      const title = `${words[i % 10]} the ${things[(i * 7) % 10]} ${i % 13 === 0 ? "for Acme" : ""}`;
      task(db, `t${i}`, {
        title,
        notes_md: i % 3 === 0 ? `Notes about the ${things[i % 10]} and what follows from the meeting with the team, number ${i}` : null,
        state: i % 50 === 0 ? "archived" : i % 9 === 0 ? "done" : "active",
        last_touched_at: `2026-${String((i % 9) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")} 09:00:00+00`,
      });
      if (i % 2 === 0) db.insert("checklist_items", { id: `c${i}`, space_id: "s1", task_id: `t${i}`, title: `step ${things[(i * 3) % 10]}`, done: 0, sort_key: "a0" });
    }
    const s = buildTaskSearch("acme proposal", {})!;
    db.rows(s.sql, s.params); // warm the statement cache once, as a person's second keystroke would
    const started = performance.now();
    for (let i = 0; i < 5; i++) db.rows(s.sql, s.params);
    const each = (performance.now() - started) / 5;
    expect(db.rows(s.sql, s.params).length).toBeGreaterThan(0);
    expect(each).toBeLessThan(100);
  });
});
