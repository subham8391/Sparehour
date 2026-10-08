// A task's block on another day (the Calendar's rail, DECISIONS.md "Calendar rail in week modes"), on a real SQLite:
// the task's do-date moves to the block's day and the block is made, in one transaction and one undo step that
// puts both back; the redo makes both again.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import { UndoHistory } from "@/features/undo/undo-stack";
import { localSqlite } from "@/test/local-sqlite";
import { BlockRepo } from "./block-repo";
import { redoable } from "./redo-capture";
import type { UndoRecord, UndoRecorder } from "./undo";

beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-06T12:00:00Z"), toFake: ["Date"] }));
afterEach(() => vi.useRealTimers());

function setup() {
  const s = localSqlite();
  s.insert("user_settings", { id: "u1", user_id: "u1", timezone: "UTC", day_rollover_hour: 4 });
  s.insert("tasks", { id: "t1", space_id: "s1", title: "Draft the plan", state: "active", do_date: "2026-10-06", do_time: "10:00", estimate_min: 60, sort_key: "a0", deleted_at: null });
  const history = new UndoHistory();
  const entries: UndoRecord[] = [];
  const recorder: UndoRecorder = {
    record: (e) => {
      entries.push(e);
      history.record(redoable(s.db, e));
    },
  };
  return { s, history, entries, repo: new BlockRepo(s.db, recorder) };
}

const thursday = localDate("2026-10-08");
const block = { spaceId: "s1", userId: "u1", taskId: "t1", title: "Draft the plan", startAt: "2026-10-08T14:00:00Z", endAt: "2026-10-08T15:00:00Z" };

describe("BlockRepo.createOnTaskDay", () => {
  it("moves the task to the block's day and makes the block, in one transaction", async () => {
    const { s, repo } = setup();
    s.outside.length = 0;
    const id = await repo.createOnTaskDay(block, thursday);
    expect(s.row("tasks", "t1")).toMatchObject({ do_date: "2026-10-08", state: "active", do_time: "10:00" });
    expect(s.row("time_blocks", id)).toMatchObject({ task_id: "t1", start_at: "2026-10-08T14:00:00Z", end_at: "2026-10-08T15:00:00Z", locked: 0, source: "manual", push_state: "local", deleted_at: null });
    // The two writes never ran apart: only the reads for the undo's snapshot and its words did.
    expect(s.outside.filter((sql) => /^\s*(update|insert)/i.test(sql))).toEqual([]);
  });

  it("is one undo step, with a toast naming the day, that puts the task back and takes the block away", async () => {
    const { s, repo, history, entries } = setup();
    const id = await repo.createOnTaskDay(block, thursday);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ label: "Blocked “Draft the plan” on Thu 8 Oct", toast: true, rows: { tasks: ["t1"], time_blocks: [id] } });
    expect(entries[0].announce).toBe("Blocked “Draft the plan” on Thu 8 Oct 14:00–15:00");
    await history.undo();
    expect(s.row("tasks", "t1")).toMatchObject({ do_date: "2026-10-06", state: "active" });
    expect(s.row("time_blocks", id)?.deleted_at).not.toBeNull();
    expect(history.canUndo).toBe(false);
  });

  it("redoes both, and undoes both again", async () => {
    const { s, repo, history } = setup();
    const id = await repo.createOnTaskDay(block, thursday);
    await history.undo();
    await history.redo();
    expect(s.row("tasks", "t1")?.do_date).toBe("2026-10-08");
    expect(s.row("time_blocks", id)?.deleted_at).toBeNull();
    await history.undo();
    expect(s.row("tasks", "t1")?.do_date).toBe("2026-10-06");
    expect(s.row("time_blocks", id)?.deleted_at).not.toBeNull();
  });

  it("an Inbox task given a day this way becomes active, and its undo makes it an Inbox task again", async () => {
    const { s, repo, history } = setup();
    s.insert("tasks", { id: "t2", space_id: "s1", title: "Call the bank", state: "inbox", do_date: null, sort_key: "a1", deleted_at: null });
    await repo.createOnTaskDay({ ...block, taskId: "t2", title: "Call the bank" }, thursday);
    expect(s.row("tasks", "t2")).toMatchObject({ state: "active", do_date: "2026-10-08" });
    await history.undo();
    expect(s.row("tasks", "t2")).toMatchObject({ state: "inbox", do_date: null });
  });
});
