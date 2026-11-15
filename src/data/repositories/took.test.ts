// How long a finished task took: written on the task, or on a repeat's completion, even after sync has taken the
// finished row off the device; undoing the completion takes the answer back with it.
import { describe, expect, it } from "vitest";
import { localSqlite } from "@/test/local-sqlite";
import { TaskRepo } from "./task-repo";
import { setTook, tookRow, writeTook } from "./took";
import type { UndoRecord } from "./undo";

function setup() {
  const s = localSqlite();
  const records: UndoRecord[] = [];
  const history = { record: (r: UndoRecord) => void records.push(r) };
  s.insert("tasks", { id: "t1", space_id: "s1", title: "Write the report", state: "active", estimate_min: 30, sort_key: "a0", do_date: "2026-11-16" });
  return { s, records, history, repo: new TaskRepo(s.db, history) };
}

describe("a completion asks how long it took", () => {
  it("names the task's own row", async () => {
    const { records, repo } = setup();
    await repo.complete("t1");
    expect(records).toHaveLength(1);
    expect(records[0].took).toEqual({ table: "tasks", id: "t1" });
  });

  it("names the completion of a repeat, not its rolling task", async () => {
    const { s, records, repo } = setup();
    s.insert("user_settings", { id: "u1", space_id: "s1", user_id: "u1", timezone: "UTC", day_rollover_hour: 4 });
    s.insert("tasks", { id: "r1", space_id: "s1", title: "Gym", state: "active", estimate_min: 60, sort_key: "a1", do_date: "2026-11-16", recurrence_rule: "FREQ=WEEKLY", recurrence_mode: "fixed", recurrence_series_id: "r1" });
    await repo.complete("r1");
    const completion = s.rows("select id from task_completions")[0];
    expect(records[0].took).toEqual({ table: "task_completions", id: completion.id });
  });

  it("does not ask for several finished at once", async () => {
    const { s, records, repo } = setup();
    s.insert("tasks", { id: "t2", space_id: "s1", title: "File it", state: "active", sort_key: "a1" });
    await repo.completeMany(["t1", "t2"]);
    expect(records[0].took).toBeUndefined();
  });
});

describe("tookRow", () => {
  it("reads the task with its estimate", async () => {
    const { s, repo } = setup();
    await repo.complete("t1");
    const row = await tookRow(s.db, { table: "tasks", id: "t1" });
    expect(row).toMatchObject({ estimateMin: 30, actualMin: null, defaultMin: 30 });
    expect(row?.snapshot).toMatchObject({ id: "t1", state: "done" });
  });

  it("reads the account's default estimate, for a task that had none", async () => {
    const { s } = setup();
    s.insert("user_settings", { id: "u1", space_id: "s1", user_id: "u1", default_estimate_min: 45 });
    s.insert("tasks", { id: "t9", space_id: "s1", title: "No estimate", state: "done", sort_key: "a9" });
    expect(await tookRow(s.db, { table: "tasks", id: "t9" })).toMatchObject({ estimateMin: null, defaultMin: 45 });
  });

  it("reads a completion with its task's estimate", async () => {
    const { s } = setup();
    s.insert("task_completions", { id: "c1", space_id: "s1", task_id: "t1", occurrence_date: "2026-11-16", completed_at: "2026-11-16T10:00:00Z" });
    expect(await tookRow(s.db, { table: "task_completions", id: "c1" })).toMatchObject({ estimateMin: 30, actualMin: null });
  });

  it("is null when the row is not on the device", async () => {
    const { s } = setup();
    expect(await tookRow(s.db, { table: "tasks", id: "nope" })).toBeNull();
  });
});

describe("writeTook", () => {
  it("writes the one column on a row that is still here", async () => {
    const { s, repo } = setup();
    await repo.complete("t1");
    const row = await tookRow(s.db, { table: "tasks", id: "t1" });
    await writeTook(s.db, { table: "tasks", id: "t1" }, row!.snapshot, 45);
    expect(s.row("tasks", "t1")).toMatchObject({ state: "done", actual_min: 45, estimate_min: 30 });
  });

  it("puts the finished row back to write on once sync has taken it away", async () => {
    const { s, repo } = setup();
    await repo.complete("t1");
    const row = await tookRow(s.db, { table: "tasks", id: "t1" });
    s.drop("tasks", "t1");
    await writeTook(s.db, { table: "tasks", id: "t1" }, row!.snapshot, 60);
    expect(s.row("tasks", "t1")).toMatchObject({ state: "done", title: "Write the report", actual_min: 60, completed_at: row!.snapshot.completed_at });
  });

  it("changes and clears an answer", async () => {
    const { s, repo } = setup();
    await repo.complete("t1");
    const row = await tookRow(s.db, { table: "tasks", id: "t1" });
    await writeTook(s.db, { table: "tasks", id: "t1" }, row!.snapshot, 60);
    await writeTook(s.db, { table: "tasks", id: "t1" }, row!.snapshot, 90, 60);
    expect(s.row("tasks", "t1")?.actual_min).toBe(90);
    await writeTook(s.db, { table: "tasks", id: "t1" }, row!.snapshot, null, 90);
    expect(s.row("tasks", "t1")?.actual_min).toBeNull();
  });

  it("writes a repeat's length on its completion", async () => {
    const { s } = setup();
    s.insert("task_completions", { id: "c1", space_id: "s1", task_id: "t1", occurrence_date: "2026-11-16", completed_at: "2026-11-16T10:00:00Z" });
    const row = await tookRow(s.db, { table: "task_completions", id: "c1" });
    await writeTook(s.db, { table: "task_completions", id: "c1" }, row!.snapshot, 75);
    expect(s.row("task_completions", "c1")?.actual_min).toBe(75);
    expect(s.row("tasks", "t1")?.actual_min ?? null).toBeNull();
  });

  it("is taken back when the completion is undone", async () => {
    const { s, records, repo } = setup();
    await repo.complete("t1");
    const row = await tookRow(s.db, { table: "tasks", id: "t1" });
    await writeTook(s.db, { table: "tasks", id: "t1" }, row!.snapshot, 45);
    await records[0].undo();
    expect(s.row("tasks", "t1")).toMatchObject({ state: "active", completed_at: null, actual_min: null });
  });
});

describe("setTook", () => {
  it("sets the length from the detail, with a silent undo", async () => {
    const { s, records, history, repo } = setup();
    await repo.complete("t1");
    await setTook(s.db, history, "t1", 50);
    expect(s.row("tasks", "t1")?.actual_min).toBe(50);
    expect(records[1]).toMatchObject({ label: "Changed how long “Write the report” took", toast: false, rows: { tasks: ["t1"] } });
    await records[1].undo();
    expect(s.row("tasks", "t1")?.actual_min).toBeNull();
  });

  it("writes nothing when the length is already that", async () => {
    const { s, records, history, repo } = setup();
    await repo.complete("t1");
    await setTook(s.db, history, "t1", 50);
    await setTook(s.db, history, "t1", 50);
    expect(records).toHaveLength(2);
  });
});
