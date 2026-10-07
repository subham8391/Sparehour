// Redo for every repository (SCREENS.md §24 "Cmd+Z · Cmd+Shift+Z", §12 "Undo · Redo"), run against SQLite: each
// write declares its rows, an undo hands back how to make it again, and the redo puts back exactly what the undo
// took — every row the write touched, including multi-row and bulk ones — then undoes and redoes again.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDraft } from "@/core/quickadd";
import { localDate } from "@/core/time";
import { UndoHistory } from "@/features/undo/undo-stack";
import { localSqlite, type Row } from "@/test/local-sqlite";
import { clearTheSlate, restoreBatch } from "./archive";
import { AreaRepo } from "./area-repo";
import { BlockRepo } from "./block-repo";
import { ChecklistRepo } from "./checklist-repo";
import { convertTaskToProject } from "./convert";
import { duplicateTask } from "./duplicate";
import { HeadingRepo } from "./heading-repo";
import { ProjectOrderRepo } from "./project-order-repo";
import { ProjectRepo } from "./project-repo";
import { SeriesRepo } from "./series-repo";
import { TagRepo } from "./tag-repo";
import { TaskRepo } from "./task-repo";
import { redoable } from "./redo-capture";
import type { UndoRecorder } from "./undo";

// Tuesday 6 October 2026, noon UTC: blocks later today have not started.
beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-06T12:00:00Z"), toFake: ["Date"] }));
afterEach(() => vi.useRealTimers());

type Db = ReturnType<typeof localSqlite>;

/** The stack the app keeps (UndoProvider), on a real SQLite: repositories record into it, redoable as the provider makes them. */
function setup() {
  const s = localSqlite();
  s.insert("user_settings", { id: "u1", user_id: "u1", timezone: "UTC", day_rollover_hour: 4 });
  const history = new UndoHistory();
  const recorder: UndoRecorder = { record: (e) => history.record(redoable(s.db, e)) };
  return {
    s,
    history,
    recorder,
    async undo() {
      const done = await history.undo();
      expect(done?.redoable).toBe(true);
      return done!.entry.label;
    },
    async redo() {
      const back = await history.redo();
      expect(back).not.toBeNull();
      return back!.label;
    },
  };
}

/** The rows as they read, without the write stamp every undo and redo moves on. */
function state(s: Db, refs: readonly (readonly [string, string])[]): (Row | null)[] {
  return refs.map(([table, id]) => {
    const row = s.row(table, id);
    if (!row) return null;
    return Object.fromEntries(Object.entries(row).filter(([column]) => column !== "updated_at"));
  });
}

/** Write, undo, redo, undo, redo: the rows land on the written state and the original state every time. */
async function roundTrip(t: ReturnType<typeof setup>, refs: readonly (readonly [string, string])[], write: () => Promise<unknown>, between?: () => void): Promise<void> {
  const before = state(t.s, refs);
  await write();
  const after = state(t.s, refs);
  expect(after).not.toEqual(before);
  between?.();
  await t.undo();
  expect(state(t.s, refs)).toEqual(before);
  await t.redo();
  expect(state(t.s, refs)).toEqual(after);
  between?.();
  await t.undo();
  expect(state(t.s, refs)).toEqual(before);
  await t.redo();
  expect(state(t.s, refs)).toEqual(after);
}

const task = (s: Db, id: string, over: Row = {}) =>
  s.insert("tasks", { id, space_id: "s1", title: `Task ${id}`, state: "active", priority: 0, do_date: "2026-10-06", day_sort_key: `a${id}`, evening: 0, sort_key: `a${id}`, carry_count: 0, ...over });
const block = (s: Db, id: string, over: Row = {}) =>
  s.insert("time_blocks", { id, space_id: "s1", user_id: "u1", task_id: null, title: null, start_at: "2026-10-06T15:00:00Z", end_at: "2026-10-06T16:00:00Z", locked: 0, source: "manual", ...over });

describe("redo: tasks", () => {
  it("a field edit and an inline rename are made again exactly", async () => {
    const t = setup();
    task(t.s, "t1");
    const repo = new TaskRepo(t.s.db, t.recorder);
    await roundTrip(t, [["tasks", "t1"]], () => repo.update("t1", { priority: 2, deadline: localDate("2026-10-09") }));
    await roundTrip(t, [["tasks", "t1"]], () => repo.update("t1", { title: "Draft the proposal" }));
  });

  it("dropping lets go of the block again, and the block comes back with the undo", async () => {
    const t = setup();
    task(t.s, "t1");
    block(t.s, "b1", { task_id: "t1" });
    const repo = new TaskRepo(t.s.db, t.recorder);
    await roundTrip(
      t,
      [
        ["tasks", "t1"],
        ["time_blocks", "b1"],
      ],
      () => repo.setState("t1", "dropped"),
    );
    expect(t.s.row("time_blocks", "b1")?.deleted_at).not.toBeNull();
  });

  it("a completed task that sync took off the device is completed again, and undone again", async () => {
    const t = setup();
    task(t.s, "t1", { state: "inbox", do_date: null });
    const repo = new TaskRepo(t.s.db, t.recorder);
    await repo.complete("t1");
    const done = t.s.row("tasks", "t1");
    t.s.drop("tasks", "t1");
    await t.undo();
    expect(t.s.row("tasks", "t1")).toMatchObject({ state: "inbox", completed_at: null });
    await t.redo();
    expect(t.s.row("tasks", "t1")).toMatchObject({ state: "done", completed_at: done?.completed_at });
    t.s.drop("tasks", "t1");
    await t.undo();
    expect(t.s.row("tasks", "t1")).toMatchObject({ state: "inbox", completed_at: null });
  });

  it("bulk edits, bulk completes and bulk state changes are one redo for every row", async () => {
    const t = setup();
    for (const id of ["t1", "t2", "t3"]) task(t.s, id);
    task(t.s, "t4", { state: "inbox", do_date: null });
    const repo = new TaskRepo(t.s.db, t.recorder);
    const rows = ["t1", "t2", "t3", "t4"].map((id) => ["tasks", id] as const);
    await roundTrip(t, rows, () => repo.updateMany(["t1", "t2", "t4"], { doDate: localDate("2026-10-07"), doTime: null, evening: false }, "Moved {title} to tomorrow"));
    await roundTrip(t, rows, () => repo.completeMany(["t1", "t2", "t3"]));
    await roundTrip(t, rows, () => repo.setStateMany(["t2", "t3", "t4"], "someday"));
  });

  it("Inbox triage and Triage all's moves (today, this week, Someday, drop) redo", async () => {
    const t = setup();
    for (const id of ["i1", "i2", "i3"]) task(t.s, id, { state: "inbox", do_date: null, day_sort_key: null });
    const repo = new TaskRepo(t.s.db, t.recorder);
    await roundTrip(t, [["tasks", "i1"]], () => repo.update("i1", { doDate: localDate("2026-10-06"), doTime: null, evening: false }, "Moved {title} to today"));
    await roundTrip(t, [["tasks", "i2"]], () => repo.setState("i2", "active", "Moved {title} to this week"));
    await roundTrip(t, [["tasks", "i3"]], () => repo.setState("i3", "someday"));
  });

  it("a drop on another day and a reorder redo with the block the move let go of", async () => {
    const t = setup();
    task(t.s, "t1");
    block(t.s, "b1", { task_id: "t1" });
    const repo = new TaskRepo(t.s.db, t.recorder);
    await roundTrip(
      t,
      [
        ["tasks", "t1"],
        ["time_blocks", "b1"],
      ],
      () => repo.placeInDay("t1", localDate("2026-10-08"), "a5"),
    );
    await roundTrip(t, [["tasks", "t1"]], () => repo.setDayOrder("t1", "z9"));
  });

  it("completing a repeat redoes its completion, its next occurrence and its unticked steps", async () => {
    const t = setup();
    task(t.s, "r1", { recurrence_rule: "FREQ=DAILY", recurrence_mode: "fixed", recurrence_series_id: "r1", miss_policy: "skip" });
    t.s.insert("checklist_items", { id: "c1", space_id: "s1", task_id: "r1", title: "Fill the can", done: 1, sort_key: "a0" });
    const repo = new TaskRepo(t.s.db, t.recorder);
    await repo.complete("r1");
    const [completion] = t.s.rows("select * from task_completions");
    const refs = [
      ["tasks", "r1"],
      ["task_completions", String(completion.id)],
      ["checklist_items", "c1"],
    ] as const;
    const after = state(t.s, refs);
    expect(after[0]).toMatchObject({ do_date: "2026-10-07", state: "active" });
    expect(after[2]).toMatchObject({ done: 0 });
    await t.undo();
    expect(t.s.row("tasks", "r1")).toMatchObject({ do_date: "2026-10-06" });
    expect(t.s.row("task_completions", String(completion.id))?.deleted_at).not.toBeNull();
    expect(t.s.row("checklist_items", "c1")).toMatchObject({ done: 1 });
    await t.redo();
    expect(state(t.s, refs)).toEqual(after);
  });

  it("a pasted list (quick add, the brain dump) is made again with its tag links", async () => {
    const t = setup();
    const repo = new TaskRepo(t.s.db, t.recorder);
    const ids = [
      await repo.create({ ...emptyDraft(), title: "Buy milk", tagNames: ["errands"] }, { spaceId: "s1" }),
      await repo.create({ ...emptyDraft(), title: "Call Dana", tagNames: ["errands", "calls"] }, { spaceId: "s1" }),
    ];
    const links = t.s.rows("select id from task_tags").map((r) => String(r.id));
    expect(links).toHaveLength(3);
    // As quick-add-provider and brain-dump record a paste.
    t.recorder.record({ label: "2 tasks added", toast: true, rows: { tasks: ids, task_tags: { task_id: ids } }, undo: () => repo.removeCreated(ids) });
    const refs = [...ids.map((id) => ["tasks", id] as const), ...links.map((id) => ["task_tags", id] as const)];
    const after = state(t.s, refs);
    await t.undo();
    expect(t.s.rows("select id from tasks where deleted_at is null")).toHaveLength(0);
    expect(t.s.rows("select id from task_tags where deleted_at is null")).toHaveLength(0);
    // Sync takes the removed rows away before the redo: they come back all the same.
    for (const id of ids) t.s.drop("tasks", id);
    await t.redo();
    expect(state(t.s, refs)).toEqual(after);
    await t.undo();
    expect(t.s.rows("select id from tasks where deleted_at is null")).toHaveLength(0);
  });
});

describe("redo: blocks", () => {
  it("draw, move, resize, rename, lock, duplicate and remove each redo", async () => {
    const t = setup();
    const repo = new BlockRepo(t.s.db, t.recorder);
    const drawn = await repo.create({ spaceId: "s1", userId: "u1", taskId: null, title: null, startAt: "2026-10-06T15:00:00Z", endAt: "2026-10-06T15:30:00Z" });
    const made = state(t.s, [["time_blocks", drawn]]);
    await t.undo();
    expect(t.s.row("time_blocks", drawn)?.deleted_at).not.toBeNull();
    t.s.drop("time_blocks", drawn);
    await t.redo();
    expect(state(t.s, [["time_blocks", drawn]])).toEqual(made);

    const b = [["time_blocks", drawn]] as const;
    await roundTrip(t, b, () => repo.move(drawn, "2026-10-06T16:00:00Z", "2026-10-06T16:30:00Z"));
    await roundTrip(t, b, () => repo.move(drawn, "2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z"));
    await roundTrip(t, b, () => repo.rename(drawn, "Deep work"));
    await roundTrip(t, b, () => repo.setLocked(drawn, true));
    const copy = String(await repo.duplicate(drawn, "2026-10-06T18:00:00Z", "2026-10-06T18:30:00Z"));
    const copied = state(t.s, [["time_blocks", copy]]);
    await t.undo();
    expect(t.s.row("time_blocks", copy)?.deleted_at).not.toBeNull();
    await t.redo();
    expect(state(t.s, [["time_blocks", copy]])).toEqual(copied);
    await roundTrip(t, b, () => repo.remove(drawn), () => t.s.drop("time_blocks", drawn));
  });

  it("a Plan my day approval redoes the whole batch, its new blocks and the ones it replaced", async () => {
    const t = setup();
    block(t.s, "old", { source: "plan", task_id: "t1" });
    const repo = new BlockRepo(t.s.db, t.recorder);
    const ids = await repo.approvePlan({
      spaceId: "s1",
      userId: "u1",
      blocks: [
        { taskId: "t1", title: "Draft", startAt: "2026-10-06T13:00:00Z", endAt: "2026-10-06T14:00:00Z" },
        { taskId: "t2", title: "Review", startAt: "2026-10-06T14:00:00Z", endAt: "2026-10-06T14:30:00Z" },
      ],
      replaces: ["old"],
    });
    const refs = [...ids, "old"].map((id) => ["time_blocks", id] as const);
    const after = state(t.s, refs);
    expect(after.map((r) => r?.deleted_at == null)).toEqual([true, true, false]);
    await t.undo();
    expect(state(t.s, refs).map((r) => r?.deleted_at == null)).toEqual([false, false, true]);
    await t.redo();
    expect(state(t.s, refs)).toEqual(after);
  });
});

describe("redo: projects, headings, areas, tags and steps", () => {
  it("a project's state, name and place redo", async () => {
    const t = setup();
    t.s.insert("projects", { id: "p1", space_id: "s1", name: "Q4 launch", state: "active", sort_key: "a0", area_id: null });
    t.s.insert("areas", { id: "a1", space_id: "s1", name: "Work", sort_key: "a0" });
    const p = [["projects", "p1"]] as const;
    const projects = new ProjectRepo(t.s.db, t.recorder);
    await roundTrip(t, p, () => projects.setState("p1", "done"), () => t.s.drop("projects", "p1"));
    await roundTrip(t, p, () => projects.rename("p1", "Q4 launch plan"));
    await roundTrip(t, p, () => new ProjectOrderRepo(t.s.db, t.recorder).move("p1", { areaId: "a1", index: 0 }, "Work"));
  });

  it("deleting a heading redoes with its tasks moved up again", async () => {
    const t = setup();
    t.s.insert("headings", { id: "h1", space_id: "s1", project_id: "p1", title: "Budget", sort_key: "a0" });
    task(t.s, "t1", { project_id: "p1", heading_id: "h1" });
    task(t.s, "t2", { project_id: "p1", heading_id: "h1" });
    const refs = [
      ["headings", "h1"],
      ["tasks", "t1"],
      ["tasks", "t2"],
    ] as const;
    const headings = new HeadingRepo(t.s.db, t.recorder);
    await roundTrip(t, refs, () => headings.remove("h1"));
    await roundTrip(t, refs, () => headings.rename("h1", "Money"));
  });

  it("deleting an area redoes with its projects and loose tasks out of it again", async () => {
    const t = setup();
    t.s.insert("areas", { id: "a1", space_id: "s1", name: "Home", sort_key: "a0" });
    t.s.insert("projects", { id: "p1", space_id: "s1", name: "Garden", state: "active", area_id: "a1", sort_key: "a0" });
    task(t.s, "t1", { area_id: "a1" });
    const refs = [
      ["areas", "a1"],
      ["projects", "p1"],
      ["tasks", "t1"],
    ] as const;
    await roundTrip(t, refs, () => new AreaRepo(t.s.db, t.recorder).remove("a1"), () => t.s.drop("areas", "a1"));
  });

  it("tagging several tasks and removing a tag redo", async () => {
    const t = setup();
    for (const id of ["t1", "t2"]) task(t.s, id);
    const tags = new TagRepo(t.s.db, t.recorder);
    await tags.attachMany(["t1", "t2"], "s1", "urgent");
    const links = t.s.rows("select id from task_tags").map((r) => ["task_tags", String(r.id)] as const);
    const after = state(t.s, links);
    await t.undo();
    expect(t.s.rows("select id from task_tags where deleted_at is null")).toHaveLength(0);
    await t.redo();
    expect(state(t.s, links)).toEqual(after);
    const tagId = String(t.s.rows("select id from tags")[0].id);
    const t1Link = String(t.s.rows("select id from task_tags where task_id = 't1'")[0].id);
    await roundTrip(t, [["task_tags", t1Link]], () => tags.detach("t1", tagId));
  });

  it("ticking, renaming and deleting a step redo", async () => {
    const t = setup();
    t.s.insert("checklist_items", { id: "c1", space_id: "s1", task_id: "t1", title: "Call the bank", done: 0, sort_key: "a0" });
    const steps = new ChecklistRepo(t.s.db, t.recorder);
    const c = [["checklist_items", "c1"]] as const;
    await roundTrip(t, c, () => steps.setDone("c1", true));
    await roundTrip(t, c, () => steps.rename("c1", "Call the bank at 9"));
    await roundTrip(t, c, () => steps.remove("c1"), () => t.s.drop("checklist_items", "c1"));
  });
});

describe("redo: the slate, converting, duplicating and series edits", () => {
  it("clearing the slate and bringing the batch back redo for every task", async () => {
    const t = setup();
    for (const id of ["t1", "t2", "t3"]) task(t.s, id, { do_date: "2026-10-01" });
    block(t.s, "b1", { task_id: "t1" });
    const refs = [...["t1", "t2", "t3"].map((id) => ["tasks", id] as const), ["time_blocks", "b1"] as const];
    await roundTrip(t, refs, () => clearTheSlate(t.s.db, t.recorder, "backlog", "2026-10-06"));
    const batch = t.s.row("tasks", "t1")?.archive_batch_id;
    expect(batch).toBeTruthy();
    await roundTrip(t, refs, () => restoreBatch(t.s.db, t.recorder, String(batch)));
  });

  it("converting a task to a project redoes the project, its new tasks and the retired task", async () => {
    const t = setup();
    task(t.s, "t1", { title: "Move house" });
    t.s.insert("checklist_items", { id: "c1", space_id: "s1", task_id: "t1", title: "Book the van", done: 0, sort_key: "a0" });
    const made = await convertTaskToProject(t.s.db, t.recorder, "t1");
    const refs = [["tasks", "t1"] as const, ["projects", made!.projectId] as const, ...made!.taskIds.map((id) => ["tasks", id] as const)];
    const after = state(t.s, refs);
    await t.undo();
    expect(t.s.row("projects", made!.projectId)?.deleted_at).not.toBeNull();
    expect(t.s.row("tasks", "t1")?.state).toBe("active");
    await t.redo();
    expect(state(t.s, refs)).toEqual(after);
  });

  it("duplicating a task redoes the copy with its steps", async () => {
    const t = setup();
    task(t.s, "t1");
    t.s.insert("checklist_items", { id: "c1", space_id: "s1", task_id: "t1", title: "Step", done: 0, sort_key: "a0" });
    const copy = await duplicateTask(t.s.db, t.recorder, "t1");
    const step = String(t.s.rows("select id from checklist_items where task_id = ?", [copy!])[0].id);
    const refs = [
      ["tasks", copy!],
      ["checklist_items", step],
    ] as const;
    const after = state(t.s, refs);
    await t.undo();
    expect(t.s.row("tasks", copy!)?.deleted_at).not.toBeNull();
    await t.redo();
    expect(state(t.s, refs)).toEqual(after);
  });

  it("skipping an occurrence redoes the move and its exception", async () => {
    const t = setup();
    task(t.s, "r1", { do_date: "2026-10-12", recurrence_rule: "FREQ=WEEKLY;BYDAY=MO", recurrence_mode: "fixed", recurrence_series_id: "r1", miss_policy: "skip" });
    await new SeriesRepo(t.s.db, t.recorder).skip("r1");
    const [exception] = t.s.rows("select id from recurrence_exceptions");
    const refs = [
      ["tasks", "r1"],
      ["recurrence_exceptions", String(exception.id)],
    ] as const;
    const after = state(t.s, refs);
    expect(after[0]).toMatchObject({ do_date: "2026-10-19" });
    await t.undo();
    expect(t.s.row("tasks", "r1")?.do_date).toBe("2026-10-12");
    await t.redo();
    expect(state(t.s, refs)).toEqual(after);
  });
});

describe("redo: the rules", () => {
  it("a new write clears what there was to redo", async () => {
    const t = setup();
    task(t.s, "t1");
    const repo = new TaskRepo(t.s.db, t.recorder);
    await repo.update("t1", { priority: 1 });
    await t.undo();
    expect(t.history.canRedo).toBe(true);
    await repo.update("t1", { priority: 3 });
    expect(t.history.canRedo).toBe(false);
    expect(await t.history.redo()).toBeNull();
    expect(t.s.row("tasks", "t1")?.priority).toBe(3);
  });

  it("a redo writes back only what the undo changed: a field edited elsewhere since stays", async () => {
    const t = setup();
    task(t.s, "t1");
    const repo = new TaskRepo(t.s.db, t.recorder);
    await repo.update("t1", { priority: 2 });
    await t.undo();
    // Another device renames it before the redo.
    t.s.rows("update tasks set title = 'Renamed elsewhere' where id = 't1'");
    await t.redo();
    expect(t.s.row("tasks", "t1")).toMatchObject({ priority: 2, title: "Renamed elsewhere" });
  });

  it("server-owned columns are left to the server", async () => {
    const t = setup();
    task(t.s, "t1", { carry_count: 2 });
    const repo = new TaskRepo(t.s.db, t.recorder);
    await repo.setState("t1", "someday");
    expect(t.s.row("tasks", "t1")?.carry_count).toBe(0);
    await t.undo();
    // The server put the count back meanwhile (the client never writes it).
    t.s.rows("update tasks set carry_count = 2 where id = 't1'");
    await t.redo();
    expect(t.s.row("tasks", "t1")).toMatchObject({ state: "someday", carry_count: 2 });
  });
});
