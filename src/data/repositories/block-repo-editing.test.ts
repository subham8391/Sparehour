import { describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../powersync";
import { BlockRepo } from "./block-repo";

function fakeDb(row: Record<string, string | number | null> | null = null) {
  const execute = vi.fn().mockResolvedValue({});
  const getOptional = vi.fn().mockResolvedValue(row);
  const db = { execute, getOptional } as unknown as LocalDatabase;
  return { db, execute, getOptional };
}

describe("BlockRepo editing", () => {
  it("renames a block with an undo that puts the old title back", async () => {
    const { db, execute } = fakeDb({ title: "Draft" });
    const history = { record: vi.fn() };
    await new BlockRepo(db, history).rename("b1", "  Deep work ");
    expect(String(execute.mock.calls[0][0])).toBe("update time_blocks set title = ?, updated_at = ? where id = ?");
    expect(execute.mock.calls[0][1][0]).toBe("Deep work");
    expect(execute.mock.calls[0][1][2]).toBe("b1");
    const entry = history.record.mock.calls[0][0];
    expect(entry).toMatchObject({ label: "Renamed the block to “Deep work”", toast: true });
    await entry.undo();
    expect(execute.mock.calls[1][1][0]).toBe("Draft");
  });

  it("an empty name clears the title, so the block reads its task's title again; the same name writes nothing", async () => {
    const { db, execute } = fakeDb({ title: "Lunch" });
    const history = { record: vi.fn() };
    const repo = new BlockRepo(db, history);
    await repo.rename("b1", "   ");
    expect(execute.mock.calls[0][1][0]).toBeNull();
    expect(history.record.mock.calls[0][0].label).toBe("Cleared the block’s name");
    execute.mockClear();
    await repo.rename("b1", "Lunch");
    expect(execute).not.toHaveBeenCalled();
  });

  it("duplicates a block at a new time as an unlocked manual block, one undo taking the copy away", async () => {
    const { db, execute } = fakeDb({ space_id: "s", user_id: "u", task_id: "t1", title: "Write" });
    const history = { record: vi.fn() };
    const copy = await new BlockRepo(db, history).duplicate("b1", "2026-10-07T13:00:00Z", "2026-10-07T13:45:00Z");
    expect(copy).toEqual(expect.any(String));
    expect(copy).not.toBe("b1");
    const [sql, args] = execute.mock.calls[0];
    expect(String(sql)).toMatch(/insert into time_blocks/);
    expect(String(sql)).toMatch(/0, 'manual', 'local'/);
    expect(args.slice(0, 7)).toEqual([copy, "s", "u", "t1", "Write", "2026-10-07T13:00:00Z", "2026-10-07T13:45:00Z"]);
    expect(history.record).toHaveBeenCalledTimes(1);
    const entry = history.record.mock.calls[0][0];
    expect(entry).toMatchObject({ label: "Copied “Write”", toast: true });
    await entry.undo();
    expect(String(execute.mock.calls[1][0])).toMatch(/set deleted_at = \?/);
    expect(execute.mock.calls[1][1][2]).toBe(copy);
  });

  it("duplicating a block that is gone does nothing", async () => {
    const { db, execute } = fakeDb(null);
    const history = { record: vi.fn() };
    expect(await new BlockRepo(db, history).duplicate("b1", "a", "b")).toBeNull();
    expect(execute).not.toHaveBeenCalled();
    expect(history.record).not.toHaveBeenCalled();
  });

  it("locking is undoable", async () => {
    const { db, execute } = fakeDb();
    const history = { record: vi.fn() };
    await new BlockRepo(db, history).setLocked("b1", true);
    expect(execute.mock.calls[0][1][0]).toBe(1);
    await history.record.mock.calls[0][0].undo();
    expect(execute.mock.calls[1][1][0]).toBe(0);
  });

  it("a block of your own says it was added, whatever its placeholder name", async () => {
    const { db } = fakeDb();
    const history = { record: vi.fn() };
    await new BlockRepo(db, history).create({ spaceId: "s", userId: "u", taskId: null, title: "Block", startAt: "a", endAt: "b" });
    expect(history.record.mock.calls[0][0]).toMatchObject({ label: "Added a block", toast: true });
  });
});
