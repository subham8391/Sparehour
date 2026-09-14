import { describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import type { LocalDatabase } from "../powersync";
import { TaskRepo, columnsTouched } from "./task-repo";

function fakeDb(row: Record<string, string | number | null> | null) {
  const execute = vi.fn().mockResolvedValue({});
  const getOptional = vi.fn().mockResolvedValue(row);
  const db = { execute, getOptional, writeTransaction: vi.fn() } as unknown as LocalDatabase;
  return { db, execute, getOptional };
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
