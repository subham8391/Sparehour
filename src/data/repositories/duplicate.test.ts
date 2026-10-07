import { describe, expect, it, vi } from "vitest";
import { localSqlite } from "@/test/local-sqlite";
import { copyState, duplicateProject, duplicateTask } from "./duplicate";

function setup() {
  const s = localSqlite();
  s.insert("areas", { id: "a1", space_id: "s1", name: "Work", sort_key: "a0" });
  s.insert("projects", { id: "p1", space_id: "s1", area_id: "a1", name: "Launch", notes_md: "The plan", state: "active", deadline: "2026-11-01", sort_key: "a0" });
  s.insert("projects", { id: "p2", space_id: "s1", area_id: "a1", name: "Later", state: "active", sort_key: "a5" });
  s.insert("headings", { id: "h1", space_id: "s1", project_id: "p1", title: "Prep", sort_key: "a0" });
  s.insert("tasks", {
    id: "t1",
    space_id: "s1",
    project_id: "p1",
    heading_id: "h1",
    title: "Draft the deck",
    notes_md: "Ten slides",
    state: "active",
    priority: 3,
    do_date: "2026-10-07",
    do_time: "09:30",
    deadline: "2026-10-09",
    start_date: "2026-10-06",
    evening: 0,
    estimate_min: 45,
    carry_count: 2,
    miss_policy: "carry",
    recurrence_rule: "FREQ=WEEKLY;BYDAY=MO",
    recurrence_mode: "fixed",
    recurrence_series_id: "t1",
    sort_key: "a0",
    day_sort_key: "a0",
  });
  s.insert("tasks", { id: "t2", space_id: "s1", project_id: "p1", title: "Book the room", state: "active", do_date: "2026-10-07", sort_key: "a2", day_sort_key: "a2" });
  s.insert("tasks", { id: "t3", space_id: "s1", project_id: "p1", title: "Old thing", state: "done", completed_at: "2026-10-01T10:00:00Z", sort_key: "a3" });
  s.insert("checklist_items", { id: "c1", space_id: "s1", task_id: "t1", title: "Outline", done: 1, sort_key: "a0" });
  s.insert("checklist_items", { id: "c2", space_id: "s1", task_id: "t1", title: "Charts", done: 0, sort_key: "a1" });
  s.insert("tags", { id: "g1", space_id: "s1", name: "deep" });
  s.insert("task_tags", { id: "l1", space_id: "s1", task_id: "t1", tag_id: "g1" });
  s.insert("time_blocks", { id: "b1", space_id: "s1", task_id: "t1", start_at: "2026-10-07T09:30:00Z", end_at: "2026-10-07T10:15:00Z", locked: 0 });
  const history = { record: vi.fn() };
  return { s, history, entry: () => history.record.mock.calls[0][0] as { label: string; toast: boolean; undo: () => Promise<void> } };
}

describe("duplicateTask (SCREENS.md §10 footer ⋯ Duplicate)", () => {
  it("copies the fields, unticked steps and tags, places the copy right after the original, and not its state, carries or blocks", async () => {
    const { s, history, entry } = setup();
    const id = await duplicateTask(s.db, history, "t1");
    expect(id).toEqual(expect.any(String));
    const copy = s.row("tasks", id!)!;
    expect(copy).toMatchObject({
      project_id: "p1",
      heading_id: "h1",
      title: "Draft the deck",
      notes_md: "Ten slides",
      state: "active",
      priority: 3,
      do_date: "2026-10-07",
      do_time: "09:30",
      deadline: "2026-10-09",
      start_date: "2026-10-06",
      estimate_min: 45,
      miss_policy: "carry",
      recurrence_rule: "FREQ=WEEKLY;BYDAY=MO",
      recurrence_mode: "fixed",
      carry_count: 0,
      source: "quickadd",
      completed_at: null,
    });
    // Its own series, so the original's skips and moves never apply to it.
    expect(copy.recurrence_series_id).toBe(id);
    // Right after the original: in its list, and in its day.
    expect(String(copy.sort_key) > "a0" && String(copy.sort_key) < "a2").toBe(true);
    expect(String(copy.day_sort_key) > "a0" && String(copy.day_sort_key) < "a2").toBe(true);
    const steps = s.rows(`select title, done from checklist_items where task_id = ? order by sort_key`, [id!]);
    expect(steps).toEqual([
      { title: "Outline", done: 0 },
      { title: "Charts", done: 0 },
    ]);
    expect(s.rows(`select tag_id from task_tags where task_id = ?`, [id!])).toEqual([{ tag_id: "g1" }]);
    expect(s.rows(`select id from time_blocks where task_id = ?`, [id!])).toEqual([]);
    expect(history.record).toHaveBeenCalledTimes(1);
    expect(entry()).toMatchObject({ label: "Duplicated “Draft the deck”", toast: true });
  });

  it("one undo takes the copy, its steps and its tags away, and leaves the original as it was", async () => {
    const { s, history, entry } = setup();
    const onUndone = vi.fn();
    const id = await duplicateTask(s.db, history, "t1", onUndone);
    await entry().undo();
    expect(s.row("tasks", id!)!.deleted_at).not.toBeNull();
    expect(s.rows(`select id from checklist_items where task_id = ? and deleted_at is null`, [id!])).toEqual([]);
    expect(s.rows(`select id from task_tags where task_id = ? and deleted_at is null`, [id!])).toEqual([]);
    expect(s.row("tasks", "t1")!.deleted_at).toBeNull();
    expect(s.rows(`select id from checklist_items where task_id = 't1' and deleted_at is null`)).toHaveLength(2);
    expect(onUndone).toHaveBeenCalledWith(id);
  });

  it("a finished task's copy is open again, and a task not on this device copies nothing", async () => {
    const { s, history } = setup();
    const id = await duplicateTask(s.db, history, "t3");
    expect(s.row("tasks", id!)).toMatchObject({ state: "active", completed_at: null });
    expect(await duplicateTask(s.db, history, "nope")).toBeNull();
    expect(history.record).toHaveBeenCalledTimes(1);
  });

  it("copyState: open states stay, a finished task with nothing to file it goes to the Inbox", () => {
    expect(copyState({ state: "someday", project_id: null, do_date: null, deadline: null, start_date: null })).toBe("someday");
    expect(copyState({ state: "dropped", project_id: null, do_date: null, deadline: null, start_date: null })).toBe("inbox");
    expect(copyState({ state: "done", project_id: null, do_date: "2026-10-01", deadline: null, start_date: null })).toBe("active");
  });
});

describe("duplicateProject (SCREENS.md §9 project ⋯ duplicate)", () => {
  it("copies the project as “… (copy)” right after it, with its headings and open tasks (steps unticked), in one undo", async () => {
    const { s, history, entry } = setup();
    const id = await duplicateProject(s.db, history, "p1");
    const copy = s.row("projects", id!)!;
    expect(copy).toMatchObject({ name: "Launch (copy)", area_id: "a1", notes_md: "The plan", deadline: "2026-11-01", state: "active" });
    expect(String(copy.sort_key) > "a0" && String(copy.sort_key) < "a5").toBe(true);
    const headings = s.rows(`select id, title from headings where project_id = ?`, [id!]);
    expect(headings.map((h) => h.title)).toEqual(["Prep"]);
    const tasks = s.rows(`select id, title, heading_id, state from tasks where project_id = ? order by sort_key`, [id!]);
    // Only the open tasks; the done one stays behind.
    expect(tasks.map((t) => t.title)).toEqual(["Draft the deck", "Book the room"]);
    expect(tasks[0].heading_id).toBe(headings[0].id);
    expect(tasks[1].heading_id).toBeNull();
    expect(s.rows(`select done from checklist_items where task_id = ?`, [String(tasks[0].id)])).toEqual([{ done: 0 }, { done: 0 }]);
    expect(history.record).toHaveBeenCalledTimes(1);
    expect(entry().label).toBe("Duplicated “Launch”");

    await entry().undo();
    expect(s.row("projects", id!)!.deleted_at).not.toBeNull();
    expect(s.rows(`select id from tasks where project_id = ? and deleted_at is null`, [id!])).toEqual([]);
    expect(s.rows(`select id from headings where project_id = ? and deleted_at is null`, [id!])).toEqual([]);
    expect(s.rows(`select id from tasks where project_id = 'p1' and deleted_at is null`)).toHaveLength(3);
  });
});
