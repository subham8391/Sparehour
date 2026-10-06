import { describe, expect, it, vi } from "vitest";
import { localSqlite } from "@/test/local-sqlite";
import { canConvert, convertTaskToProject } from "./convert";

function setup() {
  const s = localSqlite();
  s.insert("areas", { id: "a1", space_id: "s1", name: "Work", sort_key: "a0" });
  s.insert("projects", { id: "p0", space_id: "s1", area_id: "a1", name: "Ops", state: "active", sort_key: "a0" });
  s.insert("tasks", {
    id: "t1",
    space_id: "s1",
    project_id: "p0",
    title: "Plan offsite",
    notes_md: "Somewhere with a lake",
    state: "active",
    priority: 3,
    do_date: "2026-10-02",
    deadline: "2026-10-30",
    estimate_min: 600,
    carry_count: 3,
    sort_key: "a0",
    day_sort_key: "a0",
  });
  s.insert("checklist_items", { id: "c2", space_id: "s1", task_id: "t1", title: "Book venue", done: 0, sort_key: "a1" });
  s.insert("checklist_items", { id: "c1", space_id: "s1", task_id: "t1", title: "Pick a date", done: 1, sort_key: "a0" });
  s.insert("checklist_items", { id: "c3", space_id: "s1", task_id: "t1", title: "Send invites", done: 0, sort_key: "a2" });
  const history = { record: vi.fn() };
  return { s, history, entry: () => history.record.mock.calls[0][0] };
}

describe("convertTaskToProject (PRODUCT_SPEC.md §6, the 2026-10-06 ruling)", () => {
  it("makes a project from the task, its steps become tasks in order, and the task is archived in a batch of its own", async () => {
    const { s, history } = setup();
    const out = await convertTaskToProject(s.db, history, "t1");
    expect(out).not.toBeNull();
    const project = s.row("projects", out!.projectId);
    expect(project).toMatchObject({ name: "Plan offsite", notes_md: "Somewhere with a lake", deadline: "2026-10-30", area_id: "a1", state: "active", deleted_at: null });
    const tasks = s.rows(`select title, state, do_date, project_id, completed_at from tasks where project_id = ? order by sort_key`, [out!.projectId]);
    expect(tasks.map((t) => [t.title, t.state, t.do_date])).toEqual([
      ["Pick a date", "done", null],
      ["Book venue", "active", null],
      ["Send invites", "active", null],
    ]);
    expect(tasks[0].completed_at).not.toBeNull();
    expect(out!.taskIds).toHaveLength(3);
    const task = s.row("tasks", "t1")!;
    // Retired: archived, in a batch, the state it left kept; its dates, estimate and priority stay on it.
    expect(task).toMatchObject({ state: "archived", archived_from_state: "active", do_date: "2026-10-02", estimate_min: 600, priority: 3 });
    expect(task.archive_batch_id).toEqual(expect.any(String));
    // The carry count is the server's to reset (tasks_guard on archive); the client never writes it.
    expect(task.carry_count).toBe(3);
    // The steps stay on the archived task, so bringing it back brings them back too.
    expect(s.rows(`select id from checklist_items where task_id = 't1' and deleted_at is null`)).toHaveLength(3);
    expect(history.record).toHaveBeenCalledTimes(1);
  });

  it("one undo removes the project and its tasks and restores the task with its checklist, state and do-date", async () => {
    const { s, history, entry } = setup();
    const out = await convertTaskToProject(s.db, history, "t1");
    expect(entry()).toMatchObject({ label: "Converted “Plan offsite” to a project", toast: true });
    s.outside.length = 0;
    await entry().undo();
    expect(s.outside).toEqual([]); // one transaction
    expect(s.row("projects", out!.projectId)?.deleted_at).not.toBeNull();
    for (const id of out!.taskIds) expect(s.row("tasks", id)?.deleted_at).not.toBeNull();
    expect(s.row("tasks", "t1")).toMatchObject({ state: "active", do_date: "2026-10-02", archive_batch_id: null, archived_from_state: null, project_id: "p0" });
    expect(s.rows(`select id from checklist_items where task_id = 't1' and deleted_at is null`)).toHaveLength(3);
  });

  it("the undo keeps what the person added to the new project meanwhile (it leaves the project, not with it) and says it is done", async () => {
    const { s, history, entry } = setup();
    const onUndone = vi.fn();
    const out = await convertTaskToProject(s.db, history, "t1", onUndone);
    s.insert("tasks", { id: "mine", space_id: "s1", project_id: out!.projectId, title: "Call the venue", state: "active", sort_key: "a9" });
    expect(onUndone).not.toHaveBeenCalled();
    await entry().undo();
    expect(s.row("tasks", "mine")).toMatchObject({ project_id: null, deleted_at: null, state: "active" });
    for (const id of out!.taskIds) expect(s.row("tasks", id)).toMatchObject({ project_id: out!.projectId });
    expect(onUndone).toHaveBeenCalledWith(out!.projectId);
  });

  it("a task with no project gives a project with no area; one with no steps gives an empty project", async () => {
    const s = localSqlite();
    s.insert("tasks", { id: "t2", space_id: "s1", title: "Learn Rust", state: "inbox", sort_key: "a0" });
    const out = await convertTaskToProject(s.db, undefined, "t2");
    expect(s.row("projects", out!.projectId)).toMatchObject({ name: "Learn Rust", area_id: null, notes_md: null, deadline: null });
    expect(out!.taskIds).toEqual([]);
    expect(s.row("tasks", "t2")).toMatchObject({ state: "archived", archived_from_state: "inbox" });
  });

  it("releases the task's future unlocked blocks and the undo brings them back", async () => {
    const { s, history, entry } = setup();
    s.insert("time_blocks", { id: "b1", space_id: "s1", task_id: "t1", start_at: "2999-01-01T09:00:00Z", end_at: "2999-01-01T10:00:00Z", locked: 0 });
    s.insert("time_blocks", { id: "b2", space_id: "s1", task_id: "t1", start_at: "2999-01-01T11:00:00Z", end_at: "2999-01-01T12:00:00Z", locked: 1 });
    await convertTaskToProject(s.db, history, "t1");
    expect(s.row("time_blocks", "b1")?.deleted_at).not.toBeNull();
    expect(s.row("time_blocks", "b2")?.deleted_at).toBeNull();
    await entry().undo();
    expect(s.row("time_blocks", "b1")?.deleted_at).toBeNull();
  });

  it("leaves a done, dropped or archived task alone", async () => {
    expect([canConvert("inbox"), canConvert("active"), canConvert("someday")]).toEqual([true, true, true]);
    expect([canConvert("done"), canConvert("dropped"), canConvert("archived"), canConvert(null)]).toEqual([false, false, false, false]);
    const s = localSqlite();
    s.insert("tasks", { id: "t3", space_id: "s1", title: "Old", state: "done", sort_key: "a0" });
    const history = { record: vi.fn() };
    expect(await convertTaskToProject(s.db, history, "t3")).toBeNull();
    expect(await convertTaskToProject(s.db, history, "missing")).toBeNull();
    expect(history.record).not.toHaveBeenCalled();
    expect(s.rows(`select id from projects`)).toEqual([]);
  });
});
