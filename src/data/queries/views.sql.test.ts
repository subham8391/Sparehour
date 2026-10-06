// The list views' statements, run against SQLite (src/test/local-sqlite.ts):
// what Upcoming, the Logbook, search and the project lists actually select.
import { describe, expect, it } from "vitest";
import { localDate } from "@/core/time";
import { localSqlite, type Row } from "@/test/local-sqlite";
import { ALL_PROJECTS_SQL, FINISHED_PROJECTS_SQL, PROJECTS_SQL } from "./nav";
import {
  AREA_FINISHED_PROJECTS_SQL,
  DAY_LOAD_SQL,
  DROPPED_SQL,
  DUE_FROM_SQL,
  PLANNED_AFTER_SQL,
  PLANNED_BETWEEN_SQL,
  PROJECT_NAME_SQL,
  STARTING_LATER_SQL,
  TASK_STATE_SQL,
  UNPLANNED_SQL,
  dayRangeParams,
  logbookStream,
} from "./views";

const TODAY = localDate("2026-10-01");

function withTasks(tasks: Row[]) {
  const db = localSqlite();
  tasks.forEach((t, i) => db.insert("tasks", { space_id: "s1", deleted_at: null, sort_key: `a${i}`, day_sort_key: `a${i}`, start_date: null, do_date: null, ...t }));
  return db;
}
const titles = (rows: Row[]) => rows.map((r) => r.title);

describe("Upcoming's statements", () => {
  const db = withTasks([
    { id: "t1", title: "Today", state: "active", do_date: "2026-10-01" },
    { id: "t2", title: "Saturday", state: "active", do_date: "2026-10-03" },
    { id: "t3", title: "Day 7", state: "active", do_date: "2026-10-07" },
    { id: "t4", title: "Day 8", state: "active", do_date: "2026-10-08" },
    { id: "t5", title: "November", state: "active", do_date: "2026-11-20" },
    { id: "t6", title: "Dated, starts Friday", state: "active", do_date: "2026-10-05", start_date: "2026-10-02" },
    { id: "t7", title: "No day, starts in two weeks", state: "active", start_date: "2026-10-15" },
    { id: "t8", title: "No day, started", state: "active", start_date: "2026-09-20" },
    { id: "t9", title: "No day", state: "active" },
    { id: "t10", title: "Later, starts later", state: "active", do_date: "2026-10-30", start_date: "2026-10-20" },
    { id: "t11", title: "Starts today", state: "active", do_date: "2026-10-02", start_date: "2026-10-01" },
    { id: "t12", title: "Parked", state: "someday", do_date: "2026-10-09" },
    { id: "t13", title: "Gone", state: "active", do_date: "2026-10-09", deleted_at: "2026-09-30T10:00:00Z" },
  ]);
  const [from, to] = dayRangeParams(TODAY, 7);

  it("the rolling week leaves out a task whose start date has not come (PRODUCT_SPEC.md §7)", () => {
    expect(titles(db.rows(PLANNED_BETWEEN_SQL, [from, to]))).toEqual(["Today", "Starts today", "Saturday", "Day 7"]);
    // As of the range's first day: tomorrow's preview (the shutdown) sees what has started by tomorrow.
    expect(titles(db.rows(PLANNED_BETWEEN_SQL, dayRangeParams(TODAY.add({ days: 4 }), 1)))).toEqual(["Dated, starts Friday"]);
  });

  it("Not yet planned holds started tasks with no day", () => {
    expect(titles(db.rows(UNPLANNED_SQL, [TODAY.toString()]))).toEqual(["No day, started", "No day"]);
  });

  it("past the week the agenda keeps going, in day order, without the not-yet-started (SCREENS.md §6)", () => {
    expect(titles(db.rows(PLANNED_AFTER_SQL, [to, TODAY.toString()]))).toEqual(["Day 8", "November"]);
  });

  it("everything hidden by a start date is listed by the day it starts", () => {
    expect(titles(db.rows(STARTING_LATER_SQL, [TODAY.toString()]))).toEqual(["Dated, starts Friday", "No day, starts in two weeks", "Later, starts later"]);
  });

  it("each day's capacity counts the open tasks that will be on its list that day, started by then", () => {
    const load = withTasks([
      { id: "a", title: "Planned", state: "active", do_date: "2026-10-02" },
      { id: "b", title: "Still in the inbox", state: "inbox", do_date: "2026-10-03" },
      { id: "c", title: "Starts by its day", state: "active", do_date: "2026-10-05", start_date: "2026-10-04" },
      { id: "d", title: "Starts after its day", state: "active", do_date: "2026-10-05", start_date: "2026-10-06" },
      { id: "e", title: "Parked", state: "someday", do_date: "2026-10-03" },
      { id: "f", title: "Outside", state: "active", do_date: "2026-10-09" },
    ]);
    expect(titles(load.rows(DAY_LOAD_SQL, ["2026-10-01", "2026-10-07"])).sort()).toEqual(["Planned", "Starts by its day", "Still in the inbox"]);
  });

  it("Due lists open tasks by deadline from a day on, unless due on the day they are planned for (SCREENS.md §6)", () => {
    const dueDb = withTasks([
      { id: "a", title: "Planned earlier", state: "active", do_date: "2026-10-02", deadline: "2026-10-04" },
      { id: "b", title: "No day", state: "active", deadline: "2026-10-03" },
      { id: "c", title: "Due on its day", state: "active", do_date: "2026-10-04", deadline: "2026-10-04" },
      { id: "d", title: "Missed", state: "active", deadline: "2026-09-30" },
      { id: "e", title: "Parked", state: "someday", deadline: "2026-10-05" },
      { id: "f", title: "Dropped", state: "dropped", deadline: "2026-10-05" },
    ]);
    expect(titles(dueDb.rows(DUE_FROM_SQL, [TODAY.toString()]))).toEqual(["No day", "Planned earlier", "Parked"]);
  });
});

describe("the Logbook's dropped tasks", () => {
  it("are every dropped task, the most recently dropped first", () => {
    const db = withTasks([
      { id: "d1", title: "Dropped Monday", state: "dropped", updated_at: "2026-09-28T09:00:00Z" },
      { id: "d2", title: "Dropped today", state: "dropped", updated_at: "2026-10-01T08:00:00.000Z" },
      { id: "d3", title: "Done", state: "done", updated_at: "2026-10-01T09:00:00Z" },
      { id: "d4", title: "Deleted", state: "dropped", updated_at: "2026-10-01T09:00:00Z", deleted_at: "2026-10-01T09:00:00Z" },
    ]);
    expect(titles(db.rows(DROPPED_SQL))).toEqual(["Dropped today", "Dropped Monday"]);
  });
});

describe("one row's facts for the keyboard", () => {
  it("a task's state and a project's name", () => {
    const db = withTasks([{ id: "t1", title: "A", state: "done" }]);
    db.insert("projects", { id: "p1", name: "Acme", state: "archived" });
    expect(db.rows(TASK_STATE_SQL, ["t1"])).toEqual([{ state: "done" }]);
    expect(db.rows(TASK_STATE_SQL, ["nope"])).toEqual([]);
    expect(db.rows(PROJECT_NAME_SQL, ["p1"])).toEqual([{ name: "Acme" }]);
  });
});

describe("projects by state", () => {
  const db = localSqlite();
  const add = (id: string, name: string, state: string, over: Row = {}) => db.insert("projects", { id, name, state, area_id: "a1", sort_key: id, deleted_at: null, ...over });
  add("p1", "Active", "active");
  add("p2", "Parked", "someday");
  add("p3", "Shipped", "done", { completed_at: "2026-09-20T10:00:00Z" });
  add("p4", "Shelved", "archived", { updated_at: "2026-09-25T10:00:00Z" });
  add("p5", "Elsewhere", "done", { area_id: "a2", completed_at: "2026-09-10T10:00:00Z" });
  add("p6", "Removed", "done", { deleted_at: "2026-09-26T10:00:00Z" });

  it("navigation lists the open ones; names and search reach every one that exists", () => {
    expect(db.rows(PROJECTS_SQL).map((r) => r.name)).toEqual(["Active", "Parked"]);
    expect(db.rows(ALL_PROJECTS_SQL).map((r) => [r.name, r.state])).toEqual([
      ["Active", "active"],
      ["Parked", "someday"],
      ["Shipped", "done"],
      ["Shelved", "archived"],
      ["Elsewhere", "done"],
    ]);
  });

  it("the finished group holds completed and archived projects, the most recent first, per area too", () => {
    expect(db.rows(FINISHED_PROJECTS_SQL).map((r) => r.name)).toEqual(["Shelved", "Shipped", "Elsewhere"]);
    expect(db.rows(AREA_FINISHED_PROJECTS_SQL, ["a1"]).map((r) => r.name)).toEqual(["Shelved", "Shipped"]);
  });
});

describe("logbookStream", () => {
  it("asks for this month and the last: done tasks are removed a week after they were finished", () => {
    expect(logbookStream(TODAY)).toEqual({ name: "logbook", parameters: { months: ["2026-10", "2026-09"] } });
    expect(logbookStream(localDate("2026-01-03")).parameters.months).toEqual(["2026-01", "2025-12"]);
  });
});
