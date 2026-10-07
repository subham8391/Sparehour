import { describe, expect, it } from "vitest";
import { localSqlite } from "@/test/local-sqlite";
import { AREA_PROJECT_CARDS_SQL, AREA_TASKS_SQL, progressLabel, weekProgress } from "./area";

const WEEK_AGO = "2026-09-30T00:00:00.000Z";

function db() {
  const s = localSqlite();
  s.insert("areas", { id: "a1", space_id: "s1", name: "Work", sort_key: "a0" });
  s.insert("projects", { id: "p1", space_id: "s1", area_id: "a1", name: "Q4 launch", state: "active", sort_key: "a0" });
  s.insert("projects", { id: "p2", space_id: "s1", area_id: "a1", name: "Hiring", state: "active", sort_key: "a1", deadline: "2026-11-01" });
  s.insert("projects", { id: "p3", space_id: "s1", area_id: "a1", name: "Shipped", state: "done", sort_key: "a2" });
  const task = (id: string, row: Record<string, string | number | null>) => s.insert("tasks", { id, space_id: "s1", title: id, sort_key: id, carry_count: 0, ...row });
  task("open1", { project_id: "p1", state: "active", estimate_min: 60, deadline: "2026-10-20" });
  task("open2", { project_id: "p1", state: "inbox", estimate_min: null, deadline: "2026-10-10" });
  task("done-this-week", { project_id: "p1", state: "done", completed_at: "2026-10-05T09:00:00.000Z" });
  task("done-long-ago", { project_id: "p1", state: "done", completed_at: "2026-09-01T09:00:00.000Z" });
  task("someday", { project_id: "p1", state: "someday" });
  task("repeat", { project_id: "p2", state: "active", estimate_min: 15, recurrence_rule: "FREQ=DAILY" });
  s.insert("task_completions", { id: "c1", space_id: "s1", task_id: "repeat", completed_at: "2026-10-06T08:00:00.000Z" });
  s.insert("task_completions", { id: "c2", space_id: "s1", task_id: "repeat", completed_at: "2026-09-02T08:00:00.000Z" });
  task("loose-b", { area_id: "a1", state: "active", sort_key: "b" });
  task("loose-a", { area_id: "a1", state: "inbox", sort_key: "a" });
  task("loose-done", { area_id: "a1", state: "done", completed_at: "2026-10-05T09:00:00.000Z" });
  task("loose-dropped", { area_id: "a1", state: "dropped" });
  task("elsewhere", { area_id: "a2", state: "active" });
  return s;
}

describe("the area view's project cards", () => {
  it("count the open tasks, their estimate, the nearest deadline and what finished this week", () => {
    const rows = db().rows(AREA_PROJECT_CARDS_SQL, [30, "a1", WEEK_AGO]);
    expect(rows).toEqual([
      { id: "p1", name: "Q4 launch", deadline: null, open_count: 2, open_min: 90, next_deadline: "2026-10-10", done_week: 1 },
      // A repeating task's completed occurrence this week counts as done.
      { id: "p2", name: "Hiring", deadline: "2026-11-01", open_count: 1, open_min: 15, next_deadline: null, done_week: 1 },
    ]);
  });
});

describe("the area's loose tasks", () => {
  it("are the open ones filed in it directly, in list order", () => {
    expect(
      db()
        .rows(AREA_TASKS_SQL, ["a1"])
        .map((r) => r.id),
    ).toEqual(["loose-a", "loose-b"]);
  });
});

describe("the progress bar", () => {
  it("is finished-this-week against those plus the open ones", () => {
    expect(weekProgress(3, 9)).toBe(0.25);
    expect(weekProgress(0, 0)).toBe(0);
    expect(weekProgress(2, 0)).toBe(1);
  });
  it("is labelled like '3 done this week · 9 open', and plain '9 open' before anything is done", () => {
    expect(progressLabel(3, 9)).toBe("3 done this week · 9 open");
    expect(progressLabel(0, 9)).toBe("9 open");
  });
});
