import { describe, expect, it, vi } from "vitest";
import { CalendarRepo } from "./calendar-repo";

function fakeDb() {
  const execute = vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: { _array: never[] } }>>(async () => ({ rows: { _array: [] } }));
  const db = {
    execute,
    writeTransaction: vi.fn(async (fn: (tx: { execute: typeof execute }) => Promise<void>) => fn({ execute })),
  };
  return { db, execute };
}

describe("CalendarRepo", () => {
  it("writes the busy and private choices as 0/1", async () => {
    const { db, execute } = fakeDb();
    const repo = new CalendarRepo(db as never);
    await repo.setRead("c1", false);
    await repo.setPrivate("c1", true);
    expect(execute.mock.calls[0]).toEqual([expect.stringMatching(/update calendars set read = \?/), [0, "c1"]]);
    expect(execute.mock.calls[1]).toEqual([expect.stringMatching(/update calendars set private = \?/), [1, "c1"]]);
  });

  it("choosing the write calendar clears every other one in the same transaction; null clears them all", async () => {
    const { db, execute } = fakeDb();
    const repo = new CalendarRepo(db as never);
    await repo.setWriteTarget("c2");
    expect(db.writeTransaction).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls.map((c) => c[0])).toEqual([expect.stringMatching(/set write_target = 0/), expect.stringMatching(/set write_target = 1 where id = \?/)]);
    expect(execute.mock.calls[0][1]).toEqual(["c2", "c2"]);
    execute.mockClear();
    await repo.setWriteTarget(null);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][1]).toEqual([null, null]);
  });
});
