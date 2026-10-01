import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDraft, type TaskDraft } from "@/core/quickadd";
import { localDate } from "@/core/time";
import { localSqlite } from "@/test/local-sqlite";
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

describe("TaskRepo: a task that leaves a day lets go of its time there", () => {
  // Seen in the walkthrough: "Tmr" on a blocked task left its block on today, still counted and still pushed.
  const iso = (d: Date) => d.toISOString();
  const inHours = (h: number) => iso(new Date(Date.now() + h * 3600_000));
  function blockDb(blocks: Record<string, string | number | null>[]) {
    const execute = vi.fn().mockResolvedValue({});
    const getOptional = vi.fn(async (sql: string): Promise<Record<string, string> | null> => (sql.startsWith("select timezone") ? { timezone: "UTC" } : { id: "t1", title: "Draft Q4 budget", do_date: "2026-10-01", state: "active" }));
    const getAll = vi.fn(async (sql: string) => (sql.includes("from time_blocks") ? blocks : []));
    const writeTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({ execute, getOptional, getAll }));
    return { db: { execute, getOptional, getAll, writeTransaction } as unknown as LocalDatabase, execute, getOptional };
  }

  it("moving to another day releases blocks that have not started and are not on the new day; undo brings them back", async () => {
    const later = { id: "b-later", task_id: "t1", start_at: inHours(2), end_at: inHours(3), locked: 0, deleted_at: null };
    const started = { id: "b-started", task_id: "t1", start_at: inHours(-1), end_at: inHours(1), locked: 0, deleted_at: null };
    const { db, execute, getOptional } = blockDb([later, started]);
    const history = { record: vi.fn() };
    const farAway = localDate(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
    await new TaskRepo(db, history).reschedule("t1", farAway);
    const release = execute.mock.calls.find(([sql]) => String(sql).startsWith("update time_blocks set deleted_at = ?"));
    expect(release?.[1].slice(2)).toEqual(["b-later"]);

    execute.mockClear();
    getOptional.mockImplementation(async (sql: string) => (sql.startsWith("select id from time_blocks") ? null : { id: "t1" }));
    await history.record.mock.calls[0][0].undo();
    const sqls = execute.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((x) => x.startsWith("insert into time_blocks"))).toBe(true);
    expect(sqls).toContain("update time_blocks set deleted_at = null, updated_at = ? where id = ?");
  });

  it("a block already on the task's new day stays", async () => {
    const tomorrowBlock = { id: "b-tmr", task_id: "t1", start_at: inHours(26), end_at: inHours(27), locked: 0, deleted_at: null };
    const { db, execute } = blockDb([tomorrowBlock]);
    const day = localDate(new Date(Date.now() + 26 * 3600_000).toISOString().slice(0, 10));
    await new TaskRepo(db, { record: vi.fn() }).reschedule("t1", day);
    expect(execute.mock.calls.some(([sql]) => String(sql).startsWith("update time_blocks"))).toBe(false);
  });

  it("parking or dropping releases every block that has not started", async () => {
    const later = { id: "b-later", task_id: "t1", start_at: inHours(2), end_at: inHours(3), locked: 0, deleted_at: null };
    const { db, execute } = blockDb([later]);
    await new TaskRepo(db, { record: vi.fn() }).setState("t1", "someday");
    const release = execute.mock.calls.find(([sql]) => String(sql).startsWith("update time_blocks set deleted_at = ?"));
    expect(release?.[1].slice(2)).toEqual(["b-later"]);
  });
});

describe("TaskRepo: a drag is undoable like any other move (FEATURES.md §8)", () => {
  // Seen in the walkthrough: dragging a task to another day or heading showed no toast, and ⌘Z did nothing —
  // or undid something older. Every drop now records its inverse; a move to another list gets a toast.
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-01T12:00:00Z"), toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  function day() {
    const s = localSqlite();
    s.insert("tasks", { id: "t1", space_id: "s1", title: "Draft Q4 budget", state: "active", do_date: "2026-10-01", day_sort_key: "a0", evening: 0 });
    const history = { record: vi.fn() };
    return { s, history, repo: new TaskRepo(s.db, history), entry: (i = 0) => history.record.mock.calls[i][0] };
  }

  it("a drop on another day says where it went, lets go of the block it held, and undo brings both back", async () => {
    const { s, repo, entry } = day();
    s.insert("time_blocks", { id: "b1", space_id: "s1", task_id: "t1", start_at: "2026-10-01T15:00:00Z", end_at: "2026-10-01T16:00:00Z", locked: 0 });
    await repo.placeInDay("t1", localDate("2026-10-06"), "a5");
    expect(s.row("tasks", "t1")).toMatchObject({ do_date: "2026-10-06", day_sort_key: "a5" });
    expect(s.row("time_blocks", "b1")?.deleted_at).not.toBeNull();
    expect(entry()).toMatchObject({ label: "Moved “Draft Q4 budget” to Tue 6 Oct", toast: true });

    s.drop("time_blocks", "b1"); // sync has taken the released block off the device
    s.outside.length = 0;
    await entry().undo();
    expect(s.outside).toEqual([]); // the task and its block come back in one transaction
    expect(s.row("tasks", "t1")).toMatchObject({ do_date: "2026-10-01", day_sort_key: "a0", evening: 0, state: "active" });
    expect(s.row("time_blocks", "b1")).toMatchObject({ deleted_at: null, start_at: "2026-10-01T15:00:00Z" });
  });

  it("days near today read as people say them", async () => {
    const { repo, history } = day();
    await repo.placeInDay("t1", localDate("2026-10-02"), "a1");
    await repo.placeInDay("t1", localDate("2026-10-01"), "a2");
    expect(history.record.mock.calls.map((c) => c[0].label)).toEqual(["Moved “Draft Q4 budget” to tomorrow", "Moved “Draft Q4 budget” to today"]);
  });

  it("a drop from the Inbox onto a day brings the task in, and undo sends it back", async () => {
    const { s, repo, entry } = day();
    s.insert("tasks", { id: "t2", space_id: "s1", title: "Call Dana", state: "inbox", do_date: null, evening: 0 });
    await repo.placeInDay("t2", localDate("2026-10-05"), "a1");
    expect(s.row("tasks", "t2")).toMatchObject({ state: "active", do_date: "2026-10-05" });
    expect(entry().label).toBe("Moved “Call Dana” to Mon 5 Oct");
    await entry().undo();
    expect(s.row("tasks", "t2")).toMatchObject({ state: "inbox", do_date: null });
  });

  it("into or out of the evening on the same day is a move with a toast", async () => {
    const { s, repo, entry } = day();
    await repo.placeInDay("t1", localDate("2026-10-01"), "a1", true);
    expect(entry()).toMatchObject({ label: "Moved “Draft Q4 budget” to the evening", toast: true });
    await repo.placeInDay("t1", localDate("2026-10-01"), "a2", false);
    expect(entry(1)).toMatchObject({ label: "Moved “Draft Q4 budget” out of the evening", toast: true });
    await entry(1).undo();
    expect(s.row("tasks", "t1")).toMatchObject({ evening: 1, day_sort_key: "a1" });
  });

  it("a new place in the same list is a silent entry that ⌘Z still takes back", async () => {
    const { s, repo, entry } = day();
    await repo.setDayOrder("t1", "a3");
    expect(entry()).toMatchObject({ label: "Reordered “Draft Q4 budget”", toast: false });
    await repo.placeInDay("t1", localDate("2026-10-01"), "a4");
    expect(entry(1)).toMatchObject({ label: "Reordered “Draft Q4 budget”", toast: false });
    await entry(1).undo();
    expect(s.row("tasks", "t1")?.day_sort_key).toBe("a3");
    await entry().undo();
    expect(s.row("tasks", "t1")?.day_sort_key).toBe("a0");
  });

  function project() {
    const s = localSqlite();
    s.insert("headings", { id: "h1", space_id: "s1", project_id: "p1", title: "Research", sort_key: "a0" });
    s.insert("headings", { id: "h2", space_id: "s1", project_id: "p1", title: "Budget", sort_key: "a1" });
    s.insert("tasks", { id: "t1", space_id: "s1", project_id: "p1", heading_id: "h1", title: "Collect quotes", state: "active", sort_key: "a0" });
    const history = { record: vi.fn() };
    return { s, history, repo: new TaskRepo(s.db, history), entry: (i = 0) => history.record.mock.calls[i][0] };
  }

  it("a drag to another heading says which, and undo files it back where it was", async () => {
    const { s, repo, entry } = project();
    await repo.setOrder("t1", "a5", "h2");
    expect(s.row("tasks", "t1")).toMatchObject({ heading_id: "h2", sort_key: "a5" });
    expect(entry()).toMatchObject({ label: "Moved “Collect quotes” to Budget", toast: true });
    await entry().undo();
    expect(s.row("tasks", "t1")).toMatchObject({ heading_id: "h1", sort_key: "a0" });
  });

  it("out of a heading names the one it left; within the same heading it is a silent reorder", async () => {
    const { repo, history } = project();
    await repo.setOrder("t1", "a1", "h1");
    await repo.setOrder("t1", "a2");
    await repo.setOrder("t1", "a3", null);
    await repo.setHeading("t1", "h2");
    expect(history.record.mock.calls.map((c) => [c[0].label, c[0].toast])).toEqual([
      ["Reordered “Collect quotes”", false],
      ["Reordered “Collect quotes”", false],
      ["Moved “Collect quotes” out of Research", true],
      ["Moved “Collect quotes” to Budget", true],
    ]);
  });

  it("⌘Z after a drag undoes the drag, not the change before it", async () => {
    // The stack is last-in, first-out: the drop's entry sits above the completion recorded earlier.
    const s = localSqlite();
    s.insert("tasks", { id: "done", space_id: "s1", title: "Pay rent", state: "active", do_date: "2026-10-01" });
    s.insert("tasks", { id: "moved", space_id: "s1", title: "Draft Q4 budget", state: "active", do_date: "2026-10-01", day_sort_key: "a0", evening: 0 });
    const stack: { undo: () => Promise<void> }[] = [];
    const repo = new TaskRepo(s.db, { record: (e) => void stack.push(e) });
    await repo.complete("done");
    await repo.placeInDay("moved", localDate("2026-10-06"), "a1");
    await stack.pop()!.undo();
    expect(s.row("tasks", "moved")?.do_date).toBe("2026-10-01");
    expect(s.row("tasks", "done")?.state).toBe("done");
  });
});

describe("TaskRepo: no date and no project is the Inbox; any date or a project is active (PRODUCT_SPEC.md §5.1 rule 5, §7)", () => {
  const draft = (over: Partial<TaskDraft>): TaskDraft => ({ ...emptyDraft(), title: "Fix the build", ...over });

  it("quick-add with a project, a do date, a deadline or a start date lands active; with none of them, in the Inbox", async () => {
    // Seen in the walkthrough: tasks added inside a project landed in the Inbox with an "Inbox" chip.
    const s = localSqlite();
    const repo = new TaskRepo(s.db);
    const ids = {
      project: await repo.create(draft({}), { spaceId: "s1", projectId: "p1" }),
      day: await repo.create(draft({ doDate: localDate("2026-10-02") }), { spaceId: "s1" }),
      deadline: await repo.create(draft({ deadline: localDate("2026-10-09") }), { spaceId: "s1" }),
      start: await repo.create(draft({ startDate: localDate("2026-10-05") }), { spaceId: "s1" }),
      nothing: await repo.create(draft({ estimateMin: 30, priority: 2 }), { spaceId: "s1" }),
    };
    const state = (id: string) => s.row("tasks", id)?.state;
    expect(Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, state(id)]))).toEqual({ project: "active", day: "active", deadline: "active", start: "active", nothing: "inbox" });
  });

  function triage() {
    const s = localSqlite();
    s.insert("tasks", { id: "in", space_id: "s1", title: "Call Dana", state: "inbox" });
    s.insert("tasks", { id: "park", space_id: "s1", title: "Learn Rust", state: "someday" });
    s.insert("tasks", { id: "done", space_id: "s1", title: "Pay rent", state: "done" });
    const history = { record: vi.fn() };
    return { s, history, repo: new TaskRepo(s.db, history), state: (id: string) => s.row("tasks", id)?.state };
  }

  it("filing an Inbox task into a project takes it out of the Inbox, and undo puts it back", async () => {
    // Seen in the walkthrough: filing from the detail panel left the task in the Inbox.
    const { repo, history, state, s } = triage();
    await repo.update("in", { projectId: "p1" });
    expect(s.row("tasks", "in")).toMatchObject({ project_id: "p1", state: "active" });
    await history.record.mock.calls[0][0].undo();
    expect(s.row("tasks", "in")).toMatchObject({ project_id: null, state: "inbox" });
    await repo.update("in", { deadline: localDate("2026-10-09") });
    expect(state("in")).toBe("active");
  });

  it("a start date takes it out too; the bulk bar's project move does the same for every ticked task", async () => {
    const { repo, state, s } = triage();
    s.insert("tasks", { id: "in2", space_id: "s1", title: "Book flights", state: "inbox" });
    await repo.update("in", { startDate: localDate("2026-10-05") });
    expect(state("in")).toBe("active");
    await repo.updateMany(["in2", "park"], { projectId: "p1" }, "Moved {title} to Acme");
    expect([state("in2"), state("park")]).toEqual(["active", "someday"]);
  });

  it("a Someday task given a project or a deadline stays parked; only a do date brings it back", async () => {
    const { repo, state } = triage();
    await repo.update("park", { projectId: "p1" });
    await repo.update("park", { deadline: localDate("2026-10-09") });
    expect(state("park")).toBe("someday");
    await repo.update("park", { doDate: localDate("2026-10-02"), projectId: "p2" });
    expect(state("park")).toBe("active");
  });

  it("clearing a project or a date never changes the state, and a done task stays done", async () => {
    const { repo, state, s } = triage();
    s.insert("tasks", { id: "act", space_id: "s1", title: "Ship it", state: "active", project_id: "p1" });
    await repo.update("act", { projectId: null, deadline: null });
    await repo.update("done", { projectId: "p1" });
    expect([state("act"), state("done")]).toEqual(["active", "done"]);
  });

  it("the undo snapshot covers the state whenever the patch can change it", () => {
    expect(columnsTouched({ projectId: "p1" })).toEqual(["project_id", "state"]);
    expect(columnsTouched({ deadline: localDate("2026-10-09") })).toEqual(["deadline", "state"]);
    expect(columnsTouched({ startDate: localDate("2026-10-05") })).toEqual(["start_date", "state"]);
    expect(columnsTouched({ projectId: null })).toEqual(["project_id"]);
  });
});

describe("TaskRepo: reopening restores the previous state (PRODUCT_SPEC.md §7 rule 2)", () => {
  function done(rows: Record<string, string | number | null>[]) {
    const s = localSqlite();
    for (const r of rows) s.insert("tasks", { space_id: "s1", state: "done", completed_at: "2026-10-01T09:00:00Z", ...r });
    return { s, repo: new TaskRepo(s.db, { record: vi.fn() }) };
  }

  it("an Inbox task completed and reopened goes back to the Inbox, with no date", async () => {
    const { s, repo } = done([{ id: "t1", title: "Call Dana" }]);
    await repo.reopen("t1");
    expect(s.row("tasks", "t1")).toMatchObject({ state: "inbox", do_date: null, completed_at: null });
  });

  it("a task with a project or any date goes back to active, keeping its day", async () => {
    const { s, repo } = done([
      { id: "filed", title: "Collect quotes", project_id: "p1" },
      { id: "dated", title: "Pay rent", do_date: "2026-09-30" },
      { id: "due", title: "File taxes", deadline: "2026-10-31" },
      { id: "later", title: "Plan offsite", start_date: "2026-10-12" },
    ]);
    for (const id of ["filed", "dated", "due", "later"]) await repo.reopen(id);
    expect(s.rows("select id, state from tasks order by id")).toEqual([
      { id: "dated", state: "active" },
      { id: "due", state: "active" },
      { id: "filed", state: "active" },
      { id: "later", state: "active" },
    ]);
    expect(s.row("tasks", "dated")?.do_date).toBe("2026-09-30");
  });

  it("completing an Inbox task and reopening it, or undoing the completion, both end in the Inbox", async () => {
    const s = localSqlite();
    s.insert("tasks", { id: "t1", space_id: "s1", title: "Call Dana", state: "inbox" });
    const history = { record: vi.fn() };
    const repo = new TaskRepo(s.db, history);
    await repo.complete("t1");
    await history.record.mock.calls[0][0].undo();
    expect(s.row("tasks", "t1")?.state).toBe("inbox");
    await repo.complete("t1");
    await repo.reopen("t1");
    expect(s.row("tasks", "t1")?.state).toBe("inbox");
    expect(history.record.mock.calls.at(-1)?.[0]).toMatchObject({ label: "Reopened “Call Dana”", toast: false });
  });
});
