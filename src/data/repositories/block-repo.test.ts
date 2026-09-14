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
});
