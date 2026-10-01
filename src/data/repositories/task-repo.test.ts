import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import type { LocalDatabase } from "../powersync";
import { TaskRepo, columnsTouched } from "./task-repo";

function fakeDb(row: Record<string, string | number | null> | null, rows: Record<string, string | number | null>[] = []) {
  const execute = vi.fn().mockResolvedValue({});
  const getOptional = vi.fn().mockResolvedValue(row);
  const getAll = vi.fn().mockResolvedValue(rows);
  const writeTransaction = vi.fn(async (fn: (tx: { execute: typeof execute; getOptional: typeof getOptional; getAll: typeof getAll }) => Promise<void>) => fn({ execute, getOptional, getAll }));
  const db = { execute, getOptional, getAll, writeTransaction } as unknown as LocalDatabase;
  return { db, execute, getOptional, getAll };
}

const row = { title: "Draft the proposal", state: "active", do_date: "2026-09-14", do_time: "15:00", completed_at: null, priority: 0 };

describe("TaskRepo undo", () => {
  it("dropping records the inverse with a toast, and the inverse restores what it touched", async () => {
    const { db, execute } = fakeDb(row);
    const history = { record: vi.fn() };
    await new TaskRepo(db, history).setState("t1", "dropped");
    expect(execute).toHaveBeenCalledTimes(1);
    const entry = history.record.mock.calls[0][0];
    expect(entry.label).toBe("Dropped “Draft the proposal”");
    expect(entry.toast).toBe(true);
    await entry.undo();
    const [sql, args] = execute.mock.calls[1];
    expect(sql).toBe("update tasks set state = ?, do_date = ?, updated_at = ? where id = ?");
    expect(args.slice(0, 2)).toEqual(["active", "2026-09-14"]);
    expect(args.at(-1)).toBe("t1");
  });

  it("completing, moving and parking are undoable with their own words", async () => {
    const { db } = fakeDb(row);
    const history = { record: vi.fn() };
    const repo = new TaskRepo(db, history);
    await repo.complete("t1");
    await repo.reschedule("t1", localDate("2026-09-15"));
    await repo.setState("t1", "someday");
    await repo.reopen("t1");
    expect(history.record.mock.calls.map((c) => [c[0].label, c[0].toast])).toEqual([
      ["Completed “Draft the proposal”", true],
      ["Moved “Draft the proposal”", true],
      ["Moved “Draft the proposal” to Someday", true],
      ["Reopened “Draft the proposal”", false],
    ]);
  });

  it("a field edit is undoable but silent unless the caller names the move", async () => {
    const { db } = fakeDb(row);
    const history = { record: vi.fn() };
    const repo = new TaskRepo(db, history);
    await repo.update("t1", { priority: 2 });
    expect(history.record.mock.calls[0][0]).toMatchObject({ label: "Changed “Draft the proposal”", toast: false });
    await repo.update("t1", { doDate: localDate("2026-09-15"), doTime: null, evening: false }, "Moved {title} to tomorrow");
    expect(history.record.mock.calls[1][0]).toMatchObject({ label: "Moved “Draft the proposal” to tomorrow", toast: true });
  });

  it("without a recorder it reads the row once (does it repeat?) and records nothing", async () => {
    const { db, getOptional, execute } = fakeDb(row);
    await new TaskRepo(db).complete("t1");
    expect(getOptional).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("clearing the slate archives the batch and one undo restores every task", async () => {
    const { db, execute } = fakeDb(row, [
      { id: "t1", state: "active", do_date: "2026-09-12" },
      { id: "t2", state: "inbox", do_date: "2026-09-13" },
    ]);
    const history = { record: vi.fn() };
    await new TaskRepo(db, history).archiveMany(["t1", "t2"]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(String(execute.mock.calls[0][0])).toMatch(/set state = 'archived', do_date = null, carry_count = 0/);
    expect(execute.mock.calls[0][1].slice(1)).toEqual(["t1", "t2"]);
    const entry = history.record.mock.calls[0][0];
    expect(entry).toMatchObject({ label: "Cleared the slate · 2 tasks", toast: true });
    await entry.undo();
    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls[1][1].slice(0, 2)).toEqual(["active", "2026-09-12"]);
    expect(execute.mock.calls[2][1].slice(0, 2)).toEqual(["inbox", "2026-09-13"]);
  });

  it("a bulk edit is one statement and one undo entry that restores every row", async () => {
    const { db, execute, getAll } = fakeDb(row, [
      { id: "t1", title: "Draft the proposal", do_date: "2026-09-14", do_time: "15:00", state: "active" },
      { id: "t2", title: "Call Mum", do_date: null, do_time: null, state: "inbox" },
    ]);
    const history = { record: vi.fn() };
    const repo = new TaskRepo(db, history);
    await repo.updateMany(["t1", "t2"], { doDate: localDate("2026-09-15"), doTime: null, evening: false }, "Moved {title} to tomorrow");
    expect(String(getAll.mock.calls[0][0])).toMatch(/select \* from tasks where id in \(\?, \?\)/);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(String(execute.mock.calls[0][0])).toMatch(/^update tasks set do_date = \?, state = case .* where id in \(\?, \?\)$/);
    expect(execute.mock.calls[0][1].slice(-2)).toEqual(["t1", "t2"]);
    const entry = history.record.mock.calls[0][0];
    expect(entry).toMatchObject({ label: "Moved 2 tasks to tomorrow", toast: true });
    await entry.undo();
    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls[1][1].slice(0, 3)).toEqual(["2026-09-14", "15:00", "active"]);
    expect(execute.mock.calls[2][1].slice(0, 3)).toEqual([null, null, "inbox"]);
  });

  it("bulk complete, drop and park use the batch words; one row keeps its title", async () => {
    const { db, execute } = fakeDb(row, [
      { id: "t1", title: "Draft the proposal", state: "active", do_date: "2026-09-14", completed_at: null },
      { id: "t2", title: "Call Mum", state: "inbox", do_date: null, completed_at: null },
    ]);
    const history = { record: vi.fn() };
    const repo = new TaskRepo(db, history);
    await repo.completeMany(["t1", "t2"]);
    expect(String(execute.mock.calls[0][0])).toMatch(/set state = 'done', completed_at = \?, updated_at = \? where id in \(\?, \?\)/);
    await repo.setStateMany(["t1", "t2"], "dropped");
    await repo.setStateMany(["t1", "t2"], "someday");
    expect(history.record.mock.calls.map((c) => [c[0].label, c[0].toast])).toEqual([
      ["Completed 2 tasks", true],
      ["Dropped 2 tasks", true],
      ["Moved 2 tasks to Someday", true],
    ]);
    const one = fakeDb(row, [{ id: "t1", title: "Draft the proposal", state: "active", do_date: "2026-09-14" }]);
    const single = { record: vi.fn() };
    await new TaskRepo(one.db, single).setStateMany(["t1"], "dropped");
    expect(single.record.mock.calls[0][0].label).toBe("Dropped “Draft the proposal”");
  });

  it("reorder writes touch one row: the key, the section when given, or the day with its key", async () => {
    const { db, execute } = fakeDb(row);
    const repo = new TaskRepo(db);
    await repo.setOrder("t1", "a1");
    expect(execute.mock.calls[0][0]).toBe("update tasks set sort_key = ?, updated_at = ? where id = ?");
    await repo.setOrder("t1", "a1", "h1");
    expect(execute.mock.calls[1][0]).toBe("update tasks set sort_key = ?, heading_id = ?, updated_at = ? where id = ?");
    expect(execute.mock.calls[1][1].slice(0, 2)).toEqual(["a1", "h1"]);
    await repo.placeInDay("t1", localDate("2026-09-15"), "a2");
    expect(String(execute.mock.calls[2][0])).toMatch(/^update tasks set do_date = \?, day_sort_key = \?, evening = \?, state = case when state in \('inbox', 'someday'\) then 'active' else state end/);
    expect(execute.mock.calls[2][1].slice(0, 3)).toEqual(["2026-09-15", "a2", 0]);
  });

  it("bulk writes on nothing do nothing", async () => {
    const { db, execute } = fakeDb(row);
    const history = { record: vi.fn() };
    const repo = new TaskRepo(db, history);
    await repo.updateMany([], { priority: 2 });
    await repo.completeMany([]);
    await repo.setStateMany([], "someday");
    expect(execute).not.toHaveBeenCalled();
    expect(history.record).not.toHaveBeenCalled();
  });

  it("clearing an empty slate does nothing", async () => {
    const { db, execute } = fakeDb(row);
    const history = { record: vi.fn() };
    await new TaskRepo(db, history).archiveMany([]);
    expect(execute).not.toHaveBeenCalled();
    expect(history.record).not.toHaveBeenCalled();
  });

  it("a task that is already gone records nothing", async () => {
    const { db } = fakeDb(null);
    const history = { record: vi.fn() };
    await new TaskRepo(db, history).complete("missing");
    expect(history.record).not.toHaveBeenCalled();
  });
});

describe("columnsTouched", () => {
  it("maps patch keys to the columns the write changes, without duplicates", () => {
    expect(columnsTouched({ doDate: localDate("2026-09-14"), doTime: null })).toEqual(["do_date", "do_time", "state"]);
    expect(columnsTouched({ recurrenceRule: "FREQ=DAILY", recurrenceMode: "fixed" })).toEqual(["recurrence_rule", "recurrence_mode", "recurrence_series_id"]);
    expect(columnsTouched({})).toEqual([]);
  });
});

describe("TaskRepo undo after the row has left the device", () => {
  // A completed task leaves the working set once the completion has synced (the
  // tasks stream carries only open rows), so the undo first asks whether the row
  // is still here — the local tables are views and report no rows affected either way.
  const full = { id: "t1", space_id: "s1", title: "Draft the proposal", state: "inbox", completed_at: null, do_date: null, sort_key: "a0", carry_count: 0 };

  it("completing then undoing re-inserts the row as it was when it is gone", async () => {
    const { db, execute, getOptional } = fakeDb(full);
    getOptional.mockResolvedValueOnce(full).mockResolvedValueOnce(null); // the snapshot, then the presence check
    const history = { record: vi.fn() };
    await new TaskRepo(db, history).complete("t1");
    await history.record.mock.calls[0][0].undo();
    // the completion, the re-insert, then an explicit update: the sync layer drops null columns from an insert
    expect(execute).toHaveBeenCalledTimes(3);
    expect(String(getOptional.mock.calls[1][0])).toBe("select id from tasks where id = ?");
    const [insertSql, insertArgs] = execute.mock.calls[1];
    expect(insertSql).toMatch(/^insert into tasks \(id, space_id, title, state, completed_at, do_date, sort_key, carry_count, updated_at\) values \(\?, \?, \?, \?, \?, \?, \?, \?, \?\)$/);
    expect(insertArgs.slice(0, 5)).toEqual(["t1", "s1", "Draft the proposal", "inbox", null]);
    const [fixSql, fixArgs] = execute.mock.calls[2];
    expect(fixSql).toBe("update tasks set state = ?, completed_at = ?, updated_at = ? where id = ?");
    expect(fixArgs.slice(0, 2)).toEqual(["inbox", null]);
  });

  it("when the row is still here, it is updated in place and nothing is re-inserted", async () => {
    const { db, execute } = fakeDb(full);
    const history = { record: vi.fn() };
    await new TaskRepo(db, history).complete("t1");
    await history.record.mock.calls[0][0].undo();
    expect(execute).toHaveBeenCalledTimes(2);
    const [sql, args] = execute.mock.calls[1];
    expect(sql).toBe("update tasks set state = ?, completed_at = ?, updated_at = ? where id = ?");
    expect(args.slice(0, 2)).toEqual(["inbox", null]);
  });

  it("the presence check and the write share one transaction, so sync cannot take the row away between them", async () => {
    // Seen in the e2e suite under load: the done row left the device after the check said it was here,
    // the update then hit nothing, and the undo was lost without a word.
    let inside = false;
    const execute = vi.fn(async () => ({ inside }));
    const getOptional = vi.fn(async () => ({ ...full, inside }));
    const writeTransaction = vi.fn(async (fn: (tx: { execute: typeof execute; getOptional: typeof getOptional }) => Promise<void>) => {
      inside = true;
      try {
        await fn({ execute, getOptional });
      } finally {
        inside = false;
      }
    });
    const history = { record: vi.fn() };
    await new TaskRepo({ execute, getOptional, getAll: vi.fn(), writeTransaction } as unknown as LocalDatabase, history).complete("t1");
    const before = { checks: getOptional.mock.calls.length, writes: execute.mock.calls.length };
    await history.record.mock.calls[0][0].undo();
    expect(writeTransaction).toHaveBeenCalledTimes(1);
    expect(await Promise.all(getOptional.mock.results.slice(before.checks).map((r) => r.value))).toEqual([expect.objectContaining({ inside: true })]);
    expect(await Promise.all(execute.mock.results.slice(before.writes).map((r) => r.value))).toEqual([{ inside: true }]);
  });

  it("a batch undo re-inserts only the rows that are gone", async () => {
    const rows = [full, { ...full, id: "t2", title: "Call Mum" }];
    const { db, execute, getOptional } = fakeDb(full, rows);
    getOptional.mockResolvedValueOnce(null); // t1 is gone; t2 (the default) is still here
    const history = { record: vi.fn() };
    await new TaskRepo(db, history).completeMany(["t1", "t2"]);
    await history.record.mock.calls[0][0].undo();
    const sqls = execute.mock.calls.map((c) => String(c[0]));
    expect(sqls.filter((x) => x.startsWith("insert into tasks"))).toHaveLength(1);
    // t2 in place, plus the explicit write that follows t1's re-insert
    expect(sqls.filter((x) => x.startsWith("update tasks set state = ?, completed_at = ?, updated_at = ? where id = ?"))).toHaveLength(2);
    expect(execute.mock.calls[1][1][0]).toBe("t1");
  });
});

describe("TaskRepo completing a repeating task (SYSTEM_DESIGN.md §5.2)", () => {
  // The next occurrence is reckoned from the real clock, so the clock is held on the week these rows describe.
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-09-14T12:00:00Z"), toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());
  const weekly = { id: "r1", space_id: "s1", do_date: "2026-09-14", recurrence_rule: "FREQ=WEEKLY", recurrence_mode: "fixed", recurrence_series_id: "r1", recurrence_paused_until: null, actual_min: null };
  const snapshot = { id: "r1", space_id: "s1", title: "Water the plants", state: "active", do_date: "2026-09-14", completed_at: null, sort_key: "a0" };

  function repoFor(row: Record<string, unknown>) {
    const execute = vi.fn().mockResolvedValue({});
    // the row (recurrence fields and the undo snapshot in one read) → settings; then presence checks on undo
    const getOptional = vi.fn().mockResolvedValueOnce({ ...snapshot, ...row }).mockResolvedValueOnce({ timezone: "UTC", day_rollover_hour: 4 }).mockResolvedValue(snapshot);
    const getAll = vi.fn().mockResolvedValue([]);
    const writeTransaction = vi.fn(async (fn: (tx: { execute: typeof execute; getOptional: typeof getOptional; getAll: typeof getAll }) => Promise<void>) => fn({ execute, getOptional, getAll }));
    const history = { record: vi.fn() };
    return { repo: new TaskRepo({ execute, getOptional, getAll, writeTransaction } as unknown as LocalDatabase, history), execute, history };
  }

  it("records the completion, moves the row to the next occurrence, resets the checklist, and undo puts it all back", async () => {
    const { repo, execute, history } = repoFor(weekly);
    await repo.complete("r1");
    const sqls = execute.mock.calls.map((c) => String(c[0]));
    expect(sqls[0]).toMatch(/^insert into task_completions/);
    expect(execute.mock.calls[0][1].slice(1, 4)).toEqual(["s1", "r1", "2026-09-14"]);
    expect(sqls[1]).toBe("update tasks set do_date = ?, state = 'active', completed_at = null, updated_at = ? where id = ?");
    expect(execute.mock.calls[1][1][0]).toBe("2026-09-21");
    expect(sqls[2]).toMatch(/^update checklist_items set done = 0/);
    const entry = history.record.mock.calls[0][0];
    expect(entry).toMatchObject({ label: "Completed “Water the plants”", toast: true });
    await entry.undo();
    const after = execute.mock.calls.slice(3).map((c) => String(c[0]));
    expect(after[0]).toMatch(/^update task_completions set deleted_at = \?/);
    expect(after[1]).toBe("update tasks set do_date = ?, state = ?, completed_at = ?, updated_at = ? where id = ?");
    expect(execute.mock.calls[4][1].slice(0, 3)).toEqual(["2026-09-14", "active", null]);
  });

  it("when the series has ended, the row closes as done", async () => {
    const { repo, execute } = repoFor({ ...weekly, recurrence_rule: "FREQ=WEEKLY;COUNT=1" });
    await repo.complete("r1");
    const sqls = execute.mock.calls.map((c) => String(c[0]));
    expect(sqls[0]).toMatch(/^insert into task_completions/);
    expect(sqls[1]).toBe("update tasks set state = 'done', completed_at = ?, updated_at = ? where id = ?");
  });
});
