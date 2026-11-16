// A task with a day and a time holds that time on the day (DECISIONS.md, amendment 2026-11-16): the block is made
// as the task is added or given a time, moves with the time, goes when the time is taken off, follows the task to
// another day, and every one of those is taken back with its undo. A block the person placed by hand is left alone.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "@/core/quickadd";
import { instant, localDate, localTime } from "@/core/time";
import { localSqlite } from "@/test/local-sqlite";
import { TaskRepo } from "./task-repo";
import { keepTimedBlocks } from "./timed-block";
import type { UndoRecord } from "./undo";

// Friday 11 September 2026, 09:00 in London (BST): "today" for every test.
const NOW = "2026-09-11T08:00:00Z";
const ctx = { now: instant(NOW), zone: "Europe/London", today: localDate("2026-09-11") };

function setup() {
  const s = localSqlite();
  s.insert("users", { id: "u1", space_id: "s1", personal_space_id: "s1" });
  s.insert("user_settings", { id: "u1", space_id: "s1", user_id: "u1", timezone: "Europe/London", day_rollover_hour: 4, default_estimate_min: 30 });
  const records: UndoRecord[] = [];
  const history = { record: (r: UndoRecord) => void records.push(r) };
  const repo = new TaskRepo(s.db, history);
  const add = (line: string) => {
    const r = parse(line, ctx);
    if (!r.ok) throw new Error(line);
    return repo.create(r.draft, { spaceId: "s1" });
  };
  const blocks = (taskId?: string) =>
    s
      .rows(`select id, task_id, title, start_at, end_at, locked, source, deleted_at from time_blocks where deleted_at is null ${taskId ? "and task_id = ?" : ""} order by start_at`, taskId ? [taskId] : [])
      .map((b) => `${b.title} ${String(b.start_at).slice(0, 16)}–${String(b.end_at).slice(11, 16)}`);
  return { s, repo, records, add, blocks };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

describe("a task added with a time", () => {
  it("is on the timeline for its length, in the person's own zone", async () => {
    const { add, blocks, s } = setup();
    const id = await add("Workout mon 8am ~2h");
    // 08:00 to 10:00 in London is 07:00 to 09:00 UTC while summer time lasts.
    expect(blocks(id)).toEqual(["Workout 2026-09-14T07:00–09:00"]);
    expect(s.rows("select user_id, space_id, locked, source, push_state from time_blocks")[0]).toEqual({ user_id: "u1", space_id: "s1", locked: 0, source: "manual", push_state: "local" });
  });

  it("counts a task with no estimate as the account's default", async () => {
    const { add, blocks } = setup();
    await add("Standup mon 11am");
    expect(blocks()).toEqual(["Standup 2026-09-14T10:00–10:30"]);
  });

  it("makes nothing for a task with a day and no time, or a time that has wholly passed", async () => {
    const { add, blocks, s } = setup();
    await add("Buy milk mon");
    await add("Renew passport");
    // Put on today at 07:00 by hand (quick add itself would have read 7am as tomorrow's): that hour is over.
    s.insert("tasks", { id: "early", space_id: "s1", title: "Early call", state: "active", do_date: "2026-09-11", do_time: "07:00", estimate_min: 30, sort_key: "a9" });
    expect(await keepTimedBlocks(s.db, ["early"], null)).toBeNull();
    expect(blocks()).toEqual([]);
  });

  it("a paste taken back takes its blocks with it", async () => {
    const { add, blocks, repo } = setup();
    const a = await add("Standup mon 11am");
    const b = await add("Review mon 2pm ~1h");
    expect(blocks()).toHaveLength(2);
    await repo.removeCreated([a, b]);
    expect(blocks()).toEqual([]);
  });
});

describe("a time given, changed or taken off later", () => {
  it("giving a dated task a time makes its block, and undo takes it back with the time", async () => {
    const { add, blocks, repo, records, s } = setup();
    const id = await add("Write the report mon ~45m");
    expect(blocks()).toEqual([]);
    await repo.update(id, { doTime: localTime("14:00") });
    expect(blocks(id)).toEqual(["Write the report 2026-09-14T13:00–13:45"]);
    await records.at(-1)!.undo();
    expect(blocks()).toEqual([]);
    expect(s.row("tasks", id)?.do_time).toBeNull();
  });

  it("a new time moves the block that was made for the old one, and undo puts it back", async () => {
    const { add, blocks, repo, records } = setup();
    const id = await add("Workout mon 8am ~2h");
    await repo.update(id, { doTime: localTime("09:30") });
    expect(blocks(id)).toEqual(["Workout 2026-09-14T08:30–10:30"]);
    await records.at(-1)!.undo();
    expect(blocks(id)).toEqual(["Workout 2026-09-14T07:00–09:00"]);
  });

  it("a new length resizes it", async () => {
    const { add, blocks, repo } = setup();
    const id = await add("Workout mon 8am ~2h");
    await repo.update(id, { estimateMin: 60 });
    expect(blocks(id)).toEqual(["Workout 2026-09-14T07:00–08:00"]);
  });

  it("taking the time off takes the block off, and undo brings both back", async () => {
    const { add, blocks, repo, records, s } = setup();
    const id = await add("Workout mon 8am ~2h");
    await repo.update(id, { doTime: null });
    expect(blocks()).toEqual([]);
    await records.at(-1)!.undo();
    expect(blocks(id)).toEqual(["Workout 2026-09-14T07:00–09:00"]);
    expect(s.row("tasks", id)?.do_time).toBe("08:00");
  });

  it("leaves a locked block where it is", async () => {
    const { add, blocks, repo, s } = setup();
    const id = await add("Workout mon 8am ~2h");
    s.rows("update time_blocks set locked = 1 where task_id = ? returning id", [id]);
    await repo.update(id, { doTime: localTime("09:30") });
    expect(blocks(id)).toEqual(["Workout 2026-09-14T07:00–09:00"]);
  });

  it("leaves a block the person moved by hand, and makes no second one beside it", async () => {
    const { add, blocks, repo, s } = setup();
    const id = await add("Workout mon 8am ~2h");
    // Dragged to the afternoon on the timeline.
    s.rows("update time_blocks set start_at = '2026-09-14T14:00:00Z', end_at = '2026-09-14T16:00:00Z' where task_id = ? returning id", [id]);
    await repo.update(id, { doTime: localTime("09:30") });
    expect(blocks(id)).toEqual(["Workout 2026-09-14T14:00–16:00"]);
  });
});

describe("the task moves to another day", () => {
  it("lets go of the old day's block and holds the same time on the new day; undo puts it all back", async () => {
    const { add, blocks, repo, records, s } = setup();
    const id = await add("Workout mon 8am ~2h");
    await repo.reschedule(id, localDate("2026-09-15"));
    expect(blocks(id)).toEqual(["Workout 2026-09-15T07:00–09:00"]);
    await records.at(-1)!.undo();
    expect(blocks(id)).toEqual(["Workout 2026-09-14T07:00–09:00"]);
    expect(s.row("tasks", id)?.do_date).toBe("2026-09-14");
  });

  it("a drop into another day's list does the same", async () => {
    const { add, blocks, repo } = setup();
    const id = await add("Workout mon 8am ~2h");
    await repo.placeInDay(id, localDate("2026-09-16"), "a5");
    expect(blocks(id)).toEqual(["Workout 2026-09-16T07:00–09:00"]);
  });

  it("several moved at once each get theirs", async () => {
    const { add, blocks, repo } = setup();
    const a = await add("Standup mon 11am");
    const b = await add("Review mon 2pm ~1h");
    await repo.updateMany([a, b], { doDate: localDate("2026-09-17") });
    expect(blocks()).toEqual(["Standup 2026-09-17T10:00–10:30", "Review 2026-09-17T13:00–14:00"]);
  });

  it("parked in Someday or dropped, it holds no time", async () => {
    const { add, blocks, repo } = setup();
    const id = await add("Workout mon 8am ~2h");
    await repo.setState(id, "someday");
    expect(blocks()).toEqual([]);
  });
});

describe("a repeat with a time", () => {
  it("holds its time on its next day once this one is finished", async () => {
    const { add, blocks, repo, records } = setup();
    const id = await add("Standup every day 11am ~15m");
    // First occurrence: today at 11:00 (still ahead at 09:00).
    expect(blocks(id)).toEqual(["Standup 2026-09-11T10:00–10:15"]);
    await repo.complete(id);
    expect(blocks(id)).toEqual(["Standup 2026-09-11T10:00–10:15", "Standup 2026-09-12T10:00–10:15"]);
    await records.at(-1)!.undo();
    expect(blocks(id)).toEqual(["Standup 2026-09-11T10:00–10:15"]);
  });
});
