import { describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import { datePresets, FILTER_STATES } from "./filter-choices";
import { HIT_MOVE_LABEL, hitMoves, runHitMove } from "./hit-moves";

const today = localDate("2026-10-07"); // a Wednesday

describe("hitMoves", () => {
  const moves = (state: "inbox" | "active" | "someday" | "done" | "dropped" | "archived", doDate: string | null = null) => hitMoves({ state, doDate: doDate ? localDate(doDate) : null }, today);

  it("offers what the task's own list offers", () => {
    expect(moves("inbox")).toEqual(["today", "tomorrow", "someday", "drop"]);
    // Carried over: the four moves. On today, ahead or undated: Tomorrow alone.
    expect(moves("active", "2026-10-05")).toEqual(["today", "tomorrow", "someday", "drop"]);
    expect(moves("active", "2026-10-07")).toEqual(["tomorrow"]);
    expect(moves("active", "2026-10-12")).toEqual(["tomorrow"]);
    expect(moves("active")).toEqual(["tomorrow"]);
    expect(moves("someday")).toEqual(["today", "drop"]);
    expect(moves("done")).toEqual(["reopen"]);
    expect(moves("dropped")).toEqual(["restore"]);
    expect(moves("archived")).toEqual([]);
  });

  it("names each move as the row does", () => {
    expect(HIT_MOVE_LABEL).toEqual({ today: "Today", tomorrow: "Tomorrow", someday: "Someday", drop: "Drop", reopen: "Reopen", restore: "Restore" });
  });
});

describe("runHitMove", () => {
  const repo = () => ({ reschedule: vi.fn<(id: string, day: unknown) => Promise<undefined>>(async () => undefined), setState: vi.fn(async () => undefined), reopen: vi.fn(async () => undefined) });

  it("makes the one write behind each move", async () => {
    const r = repo();
    await runHitMove(r, "t1", "today", today);
    expect(r.reschedule).toHaveBeenLastCalledWith("t1", today);
    await runHitMove(r, "t1", "tomorrow", today);
    expect(String(r.reschedule.mock.lastCall?.[1])).toBe("2026-10-08");
    await runHitMove(r, "t1", "someday", today);
    expect(r.setState).toHaveBeenLastCalledWith("t1", "someday");
    await runHitMove(r, "t1", "drop", today);
    expect(r.setState).toHaveBeenLastCalledWith("t1", "dropped");
    await runHitMove(r, "t1", "restore", today);
    expect(r.setState).toHaveBeenLastCalledWith("t1", "active", "Brought back {title}");
    await runHitMove(r, "t1", "reopen", today);
    expect(r.reopen).toHaveBeenLastCalledWith("t1");
  });
});

describe("search's filter choices", () => {
  it("offers every state but Archived", () => {
    expect(FILTER_STATES).toEqual(["inbox", "active", "someday", "done", "dropped"]);
  });

  it("offers today, the week from Monday to Sunday, and the month", () => {
    expect(datePresets(today)).toEqual([
      { label: "Today", from: "2026-10-07", to: "2026-10-07" },
      { label: "This week", from: "2026-10-05", to: "2026-10-11" },
      { label: "This month", from: "2026-10-01", to: "2026-10-31" },
    ]);
    // A Sunday is the last day of its week, not the first of the next.
    expect(datePresets(localDate("2026-10-11"))[1]).toEqual({ label: "This week", from: "2026-10-05", to: "2026-10-11" });
  });
});
