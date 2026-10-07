// A reorder is silent on screen and said in words (SYSTEM_DESIGN.md §11.5, SCREENS.md §1 rule 7): the undo entry
// carries "Moved “X” after “Y”" for the live region, run against real SQL.
import { describe, expect, it, vi } from "vitest";
import { localSqlite } from "@/test/local-sqlite";
import { TaskRepo } from "./task-repo";

function setup() {
  const s = localSqlite();
  const day = { space_id: "s1", state: "active", do_date: "2026-09-14", evening: 0 };
  s.insert("tasks", { id: "a", title: "Call Dana", day_sort_key: "a1", ...day });
  s.insert("tasks", { id: "b", title: "Draft the proposal", day_sort_key: "a2", ...day });
  s.insert("tasks", { id: "c", title: "Water the plants", day_sort_key: "a3", ...day });
  s.insert("tasks", { id: "e", title: "Read", day_sort_key: "a0", ...day, evening: 1 });
  s.insert("tasks", { id: "p1", space_id: "s1", state: "active", project_id: "p", title: "Kick-off", sort_key: "b1" });
  s.insert("tasks", { id: "p2", space_id: "s1", state: "active", project_id: "p", title: "Budget", sort_key: "b2" });
  const history = { record: vi.fn() };
  return { s, history, repo: new TaskRepo(s.db, history), last: () => history.record.mock.lastCall?.[0] };
}

describe("TaskRepo reorder announcements", () => {
  it("a new place in the day's list names the task now above it, in the same section", async () => {
    const { repo, last } = setup();
    await repo.setDayOrder("c", "a15");
    expect(last()).toMatchObject({ label: "Reordered “Water the plants”", toast: false, announce: "Moved “Water the plants” after “Call Dana”" });
    // The evening's task sorts first but sits in another section, so the top of the day's list is the top.
    await repo.setDayOrder("b", "a05");
    expect(last().announce).toBe("Moved “Draft the proposal” to the top");
  });

  it("a project list reorder names its neighbour too", async () => {
    const { repo, last } = setup();
    await repo.setOrder("p1", "b3");
    expect(last()).toMatchObject({ toast: false, announce: "Moved “Kick-off” after “Budget”" });
  });
});
