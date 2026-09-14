import { describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import type { LocalDatabase } from "../powersync";
import { TaskRepo, columnsTouched } from "./task-repo";

function fakeDb(row: Record<string, string | number | null> | null, rows: Record<string, string | number | null>[] = []) {
  const execute = vi.fn().mockResolvedValue({});
  const getOptional = vi.fn().mockResolvedValue(row);
  const getAll = vi.fn().mockResolvedValue(rows);
  const writeTransaction = vi.fn(async (fn: (tx: { execute: typeof execute }) => Promise<void>) => fn({ execute }));
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

  it("without a recorder it neither snapshots nor records", async () => {
    const { db, getOptional, execute } = fakeDb(row);
    await new TaskRepo(db).complete("t1");
    expect(getOptional).not.toHaveBeenCalled();
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
    expect(String(getAll.mock.calls[0][0])).toMatch(/select id, title, do_date, do_time, state, evening from tasks where id in \(\?, \?\)/);
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
