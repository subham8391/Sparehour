import { describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../powersync";
import { BlockRepo } from "./block-repo";

function fakeDb(row: Record<string, string | number | null> | null = null) {
  const execute = vi.fn().mockResolvedValue({});
  const getOptional = vi.fn().mockResolvedValue(row);
  const db = { execute, getOptional } as unknown as LocalDatabase;
  return { db, execute, getOptional };
}

describe("BlockRepo", () => {
  it("creates a local block for a task and records an undo that removes it", async () => {
    const { db, execute } = fakeDb();
    const history = { record: vi.fn() };
    const id = await new BlockRepo(db, history).create({ spaceId: "s", userId: "u", taskId: "t1", title: "Draft the proposal", startAt: "2026-09-14T08:00:00Z", endAt: "2026-09-14T08:45:00Z" });
    expect(execute).toHaveBeenCalledTimes(1);
    const [sql, args] = execute.mock.calls[0];
    expect(String(sql)).toMatch(/insert into time_blocks/);
    expect(String(sql)).toMatch(/'manual', 'local'/);
    expect(args.slice(0, 7)).toEqual([id, "s", "u", "t1", "Draft the proposal", "2026-09-14T08:00:00Z", "2026-09-14T08:45:00Z"]);
    const entry = history.record.mock.calls[0][0];
    expect(entry).toMatchObject({ label: "Blocked “Draft the proposal”", toast: true });
    await entry.undo();
    expect(String(execute.mock.calls[1][0])).toMatch(/set deleted_at = \?/);
  });

  it("moving records the previous times silently; removing restores on undo", async () => {
    const { db, execute } = fakeDb({ start_at: "2026-09-14T08:00:00Z", end_at: "2026-09-14T08:45:00Z", title: "Draft" });
    const history = { record: vi.fn() };
    const repo = new BlockRepo(db, history);
    await repo.move("b1", "2026-09-14T09:00:00Z", "2026-09-14T09:45:00Z");
    expect(history.record.mock.calls[0][0]).toMatchObject({ label: "Moved “Draft”", toast: false });
    await history.record.mock.calls[0][0].undo();
    expect(execute.mock.calls[1][1].slice(0, 2)).toEqual(["2026-09-14T08:00:00Z", "2026-09-14T08:45:00Z"]);
    await repo.remove("b1");
    expect(history.record.mock.calls[1][0]).toMatchObject({ label: "Removed the block for “Draft”", toast: true });
    await history.record.mock.calls[1][0].undo();
    expect(String(execute.mock.calls.at(-1)?.[0])).toMatch(/set deleted_at = null/);
  });

  it("locks and unlocks", async () => {
    const { db, execute } = fakeDb();
    await new BlockRepo(db).setLocked("b1", true);
    expect(execute.mock.calls[0][1][0]).toBe(1);
  });

  describe("approvePlan", () => {
    function txDb(stillReplaceable: { id: string }[] = []) {
      const execute = vi.fn().mockResolvedValue({});
      const getAll = vi.fn().mockResolvedValue(stillReplaceable);
      const writeTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({ execute, getAll }));
      return { db: { writeTransaction } as unknown as LocalDatabase, execute, getAll, writeTransaction };
    }
    const plan = {
      spaceId: "s",
      userId: "u",
      blocks: [
        { taskId: "t1", title: "Draft the proposal", startAt: "2026-10-01T09:00:00Z", endAt: "2026-10-01T09:45:00Z" },
        { taskId: "t2", title: "Review the deck", startAt: "2026-10-01T10:00:00Z", endAt: "2026-10-01T11:30:00Z" },
      ],
      replaces: ["old1", "old2"],
    };

    it("writes every chosen block as source 'plan' and removes the replaced ones in one transaction", async () => {
      const { db, execute, getAll, writeTransaction } = txDb([{ id: "old1" }]);
      const ids = await new BlockRepo(db).approvePlan(plan);
      expect(writeTransaction).toHaveBeenCalledTimes(1);
      expect(ids).toHaveLength(2);
      // Only blocks that are still unlocked plan blocks are replaced.
      expect(String(getAll.mock.calls[0][0])).toMatch(/locked = 0 and source = 'plan'/);
      expect(getAll.mock.calls[0][1]).toEqual(["old1", "old2"]);
      expect(String(execute.mock.calls[0][0])).toMatch(/update time_blocks set deleted_at = \?/);
      expect(execute.mock.calls[0][1].slice(2)).toEqual(["old1"]);
      const inserts = execute.mock.calls.slice(1);
      expect(inserts).toHaveLength(2);
      for (const [sql] of inserts) expect(String(sql)).toMatch(/0, 'plan', 'local'/);
      expect(inserts.map(([, args]) => args.slice(0, 7))).toEqual([
        [ids[0], "s", "u", "t1", "Draft the proposal", "2026-10-01T09:00:00Z", "2026-10-01T09:45:00Z"],
        [ids[1], "s", "u", "t2", "Review the deck", "2026-10-01T10:00:00Z", "2026-10-01T11:30:00Z"],
      ]);
    });

    it("records one undo entry, with a toast, that takes the whole batch back and restores what it replaced", async () => {
      const { db, execute } = txDb([{ id: "old1" }, { id: "old2" }]);
      const history = { record: vi.fn() };
      const afterUndo = vi.fn();
      const ids = await new BlockRepo(db, history).approvePlan(plan, { afterUndo });
      expect(history.record).toHaveBeenCalledTimes(1);
      const entry = history.record.mock.calls[0][0];
      expect(entry).toMatchObject({ label: "Planned 2 blocks", toast: true });
      execute.mockClear();
      await entry.undo();
      expect(String(execute.mock.calls[0][0])).toMatch(/set deleted_at = \?/);
      expect(execute.mock.calls[0][1].slice(2)).toEqual(ids);
      expect(String(execute.mock.calls[1][0])).toMatch(/set deleted_at = null/);
      expect(execute.mock.calls[1][1].slice(1)).toEqual(["old1", "old2"]);
      expect(afterUndo).toHaveBeenCalledTimes(1);
    });

    it("says one block in the singular and replaces nothing when there is nothing to replace", async () => {
      const { db, execute, getAll } = txDb();
      const history = { record: vi.fn() };
      await new BlockRepo(db, history).approvePlan({ ...plan, blocks: plan.blocks.slice(0, 1), replaces: [] });
      expect(getAll).not.toHaveBeenCalled();
      expect(execute).toHaveBeenCalledTimes(1);
      expect(history.record.mock.calls[0][0].label).toBe("Planned 1 block");
    });
  });
});
