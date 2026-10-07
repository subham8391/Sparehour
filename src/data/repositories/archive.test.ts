import { describe, expect, it, vi } from "vitest";
import { localSqlite } from "@/test/local-sqlite";
import { SLATE_COUNTS_SQL, slateCountArgs } from "../queries/archive";
import { clearTheSlate, restoreBatch, slateClearedLabel } from "./archive";

const TODAY = "2026-10-06";

function setup() {
  const s = localSqlite();
  const task = (id: string, row: Record<string, string | number | null>) =>
    s.insert("tasks", { id, space_id: "s1", title: id, state: "active", carry_count: 0, sort_key: id, updated_at: "2026-10-01T00:00:00Z", ...row });
  task("carried", { do_date: "2026-10-02", carry_count: 3 });
  task("today", { do_date: TODAY, day_sort_key: "a0" });
  task("tomorrow", { do_date: "2026-10-07" });
  task("undated", { do_date: null });
  task("starts-later", { do_date: null, start_date: "2026-10-20" });
  task("due-later", { do_date: null, deadline: "2026-10-20" });
  task("inbox", { state: "inbox" });
  task("repeating", { do_date: TODAY, recurrence_rule: "FREQ=DAILY" });
  task("finished", { do_date: "2026-10-01", state: "done" });
  task("parked", { state: "someday" });
  // A block the carried task holds tomorrow (let go with it), and one that already started (kept).
  s.insert("time_blocks", { id: "b-future", space_id: "s1", user_id: "u1", task_id: "carried", start_at: "2999-01-01T09:00:00Z", end_at: "2999-01-01T10:00:00Z", locked: 0 });
  s.insert("time_blocks", { id: "b-past", space_id: "s1", user_id: "u1", task_id: "today", start_at: "2020-01-01T09:00:00Z", end_at: "2020-01-01T10:00:00Z", locked: 0 });
  const history = { record: vi.fn() };
  const entry = (i = 0) => history.record.mock.calls[i][0] as { label: string; toast: boolean; undo: () => Promise<void> };
  const archived = () => s.rows(`select id from tasks where state = 'archived' order by id`).map((r) => r.id);
  return { s, history, entry, archived };
}

describe("Clear the slate (PRODUCT_SPEC.md §8.5, ruled 2026-10-06)", () => {
  it("counts each scope the way it archives: Today only, and what Today + backlog adds", () => {
    const { s } = setup();
    expect(s.rows(SLATE_COUNTS_SQL, slateCountArgs(TODAY))[0]).toEqual({ today: 2, backlog: 1 });
  });

  it("Today only archives everything dated today or earlier in one batch, keeping state and dates, and one undo brings it all back", async () => {
    const { s, history, entry, archived } = setup();
    expect(await clearTheSlate(s.db, history, "today", TODAY)).toBe(2);
    expect(archived()).toEqual(["carried", "today"]);
    const rows = s.rows(`select id, archive_batch_id, archived_from_state, archived_at, do_date from tasks where state = 'archived' order by id`);
    expect(new Set(rows.map((r) => r.archive_batch_id)).size).toBe(1);
    expect(rows[0].archive_batch_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows.map((r) => [r.id, r.archived_from_state, r.do_date])).toEqual([
      ["carried", "active", "2026-10-02"],
      ["today", "active", TODAY],
    ]);
    expect(rows.every((r) => typeof r.archived_at === "string")).toBe(true);
    // The time the carried task held tomorrow goes back to the day; a block that already happened stays.
    expect(s.row("time_blocks", "b-future")?.deleted_at).not.toBeNull();
    expect(s.row("time_blocks", "b-past")?.deleted_at).toBeNull();

    expect(history.record).toHaveBeenCalledTimes(1);
    expect(entry()).toMatchObject({ label: "Slate cleared. 2 tasks archived", toast: true });
    await entry().undo();
    expect(archived()).toEqual([]);
    expect(s.row("tasks", "carried")).toMatchObject({ state: "active", do_date: "2026-10-02", archive_batch_id: null, archived_from_state: null, archived_at: null });
    expect(s.row("time_blocks", "b-future")?.deleted_at).toBeNull();
  });

  it("Today + backlog adds the undated tasks with nothing ahead; the Inbox, repeating, parked and finished tasks stay", async () => {
    const { s, history, archived } = setup();
    expect(await clearTheSlate(s.db, history, "backlog", TODAY)).toBe(3);
    expect(archived()).toEqual(["carried", "today", "undated"]);
  });

  it("does nothing, and records no undo, when the scope is empty", async () => {
    const s = localSqlite();
    const history = { record: vi.fn() };
    expect(await clearTheSlate(s.db, history, "backlog", TODAY)).toBe(0);
    expect(history.record).not.toHaveBeenCalled();
  });

  it("says the count plainly", () => {
    expect(slateClearedLabel(1)).toBe("Slate cleared. 1 task archived");
    expect(slateClearedLabel(47)).toBe("Slate cleared. 47 tasks archived");
  });
});

describe("restoreBatch (Settings › Data › Archive)", () => {
  it("returns one batch to the states its tasks left, with their dates, leaves other batches alone, and undoes as one", async () => {
    const { s, history, entry, archived } = setup();
    await clearTheSlate(s.db, history, "today", TODAY);
    const batch = s.row("tasks", "carried")?.archive_batch_id as string;
    // Another batch: the parked task, archived from Someday by a conversion.
    s.insert("tasks", { id: "converted", space_id: "s1", title: "converted", state: "archived", archive_batch_id: "other", archived_from_state: "someday", archived_at: "2026-09-01T00:00:00Z", sort_key: "z" });

    expect(await restoreBatch(s.db, history, batch)).toBe(2);
    expect(archived()).toEqual(["converted"]);
    // Its day has passed, so the carried task is in Carried over again; today's is back on today.
    expect(s.row("tasks", "carried")).toMatchObject({ state: "active", do_date: "2026-10-02", archive_batch_id: null, archived_from_state: null, archived_at: null });
    expect(s.row("tasks", "today")).toMatchObject({ state: "active", do_date: TODAY });
    expect(entry(1)).toMatchObject({ label: "Brought back 2 tasks", toast: true });
    await entry(1).undo();
    expect(archived()).toEqual(["carried", "converted", "today"]);
    expect(s.row("tasks", "carried")?.archive_batch_id).toBe(batch);

    expect(await restoreBatch(s.db, history, "other")).toBe(1);
    expect(s.row("tasks", "converted")?.state).toBe("someday");
  });

  it("brings back tasks archived before batches existed as active ones", async () => {
    const s = localSqlite();
    s.insert("tasks", { id: "old", space_id: "s1", title: "old", state: "archived", sort_key: "a" });
    expect(await restoreBatch(s.db, undefined, null)).toBe(1);
    expect(s.row("tasks", "old")?.state).toBe("active");
  });
});
