// The coming blocks' statement, run against SQLite (src/test/local-sqlite.ts): the blocks a reminder is made for.
import { describe, expect, it } from "vitest";
import { instant } from "@/core/time";
import { localSqlite } from "@/test/local-sqlite";
import { COMING_BLOCKS_SQL, TASK_BLOCKS_SQL, comingBlocksParams } from "./blocks";

function device() {
  const db = localSqlite();
  const task = (id: string, title: string, state: string, deleted: string | null = null) => db.insert("tasks", { id, title, state, space_id: "s1", deleted_at: deleted });
  const block = (id: string, start: string, taskId: string | null, title: string | null = null, deleted: string | null = null) =>
    db.insert("time_blocks", { id, task_id: taskId, title, start_at: start, end_at: start.replace(":30:", ":59:"), deleted_at: deleted });
  task("t1", "going to gym", "active");
  task("t2", "Vitamin D3", "inbox");
  task("t3", "Finished", "done");
  task("t4", "Parked", "someday");
  task("t5", "Removed", "active", "2026-11-25T10:00:00Z");
  block("b1", "2026-11-27T07:30:00Z", "t1");
  block("b2", "2026-11-26 21:30:00+00", "t2");
  block("b3", "2026-11-27T09:30:00Z", null, "Deep work");
  block("b4", "2026-11-27T10:30:00Z", "t3");
  block("b5", "2026-11-27T11:30:00Z", "t4");
  block("b6", "2026-11-27T12:30:00Z", "t5");
  block("b7", "2026-11-27T13:30:00Z", "t1", null, "2026-11-26T08:00:00Z");
  block("b8", "2026-12-20T07:30:00Z", "t1");
  block("b9", "2026-11-20T07:30:00Z", "t1");
  return db;
}

describe("COMING_BLOCKS_SQL", () => {
  const db = device();
  const params = comingBlocksParams(instant("2026-11-26T12:00:00Z"), 7);

  it("asks for the dates around the coming days, a day wider at each end", () => {
    expect(params).toEqual(["2026-11-25", "2026-12-04"]);
  });

  it("reads the blocks of open tasks and blocks with no task, with the title a reminder would carry, in start order", () => {
    expect(db.rows(COMING_BLOCKS_SQL, params).map((r) => [r.id, r.task_title, r.block_title])).toEqual([
      ["b2", "Vitamin D3", null],
      ["b1", "going to gym", null],
      ["b3", null, "Deep work"],
    ]);
  });
});

describe("TASK_BLOCKS_SQL", () => {
  it("reads a task's own blocks that end on the date or later", () => {
    expect(
      device()
        .rows(TASK_BLOCKS_SQL, ["t1", "2026-11-25"])
        .map((r) => r.id),
    ).toEqual(["b1", "b8"]);
  });
});
