import { describe, expect, it, vi } from "vitest";
import { localSqlite } from "@/test/local-sqlite";
import { TaskRepo } from "./task-repo";

function setup() {
  const s = localSqlite();
  s.insert("tasks", { id: "t1", space_id: "s1", title: "Plan offsite", state: "active", do_date: "2026-10-02", carry_count: 3, sort_key: "a0" });
  s.insert("tasks", { id: "t2", space_id: "s1", title: "Book dentist", state: "active", do_date: "2026-10-02", carry_count: 3, sort_key: "a1" });
  s.insert("checklist_items", { id: "c1", space_id: "s1", task_id: "t1", title: "Book venue", done: 0, sort_key: "a0" });
  const history = { record: vi.fn() };
  return { s, history, repo: new TaskRepo(s.db, history) };
}

describe("TaskRepo and the three-carry ask", () => {
  it("records the asks shown, as bookkeeping with no undo entry", async () => {
    const { s, history, repo } = setup();
    await repo.markAsked(["t1", "t2"], "2026-10-06T08:00:00.000Z");
    expect(s.rows(`select id, carry_asked_at from tasks order by id`)).toEqual([
      { id: "t1", carry_asked_at: "2026-10-06T08:00:00.000Z" },
      { id: "t2", carry_asked_at: "2026-10-06T08:00:00.000Z" },
    ]);
    await repo.markAsked([]);
    expect(history.record).not.toHaveBeenCalled();
  });

  it("Break it down goes through the conversion module, loaded on the call: one undo entry", async () => {
    const { s, history, repo } = setup();
    const out = await repo.convertToProject("t1");
    expect(out?.taskIds).toHaveLength(1);
    expect(s.row("projects", out!.projectId)).toMatchObject({ name: "Plan offsite" });
    expect(s.row("tasks", "t1")).toMatchObject({ state: "archived" });
    expect(history.record).toHaveBeenCalledTimes(1);
  });
});
