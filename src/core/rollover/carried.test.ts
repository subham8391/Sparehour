import { describe, expect, it } from "vitest";
import { instant, localDate } from "../time";
import type { Task } from "../types";
import { taskFixture } from "@/test/fixtures";
import { ASKS_PER_DAY, carriedOver, pickAsks } from "./carried";

const TODAY = localDate("2026-10-06");
const NOW = instant("2026-10-06T09:00:00Z");
const carried = (id: string, carryCount: number, doDate = "2026-10-05", over: Partial<Task> = {}) => taskFixture(id, id, { carryCount, doDate: localDate(doDate), ...over });
const record = (askedToday: string[] = [], askedAt: Record<string, string> = {}) => ({
  askedToday: new Set(askedToday),
  askedAt: (t: Task) => (askedAt[t.id] ? instant(askedAt[t.id]) : null),
  now: NOW,
});

describe("carriedOver order (SCREENS.md §2.3)", () => {
  it("sorts by carry count, then the original do-date oldest first, then the hand order", () => {
    const a = carried("a", 2, "2026-10-04", { daySortKey: "a2" });
    const b = carried("b", 2, "2026-10-01", { daySortKey: "a9" });
    const c = carried("c", 5, "2026-10-05");
    const d = carried("d", 2, "2026-10-04", { daySortKey: "a1" });
    expect(carriedOver([a, b, c, d], TODAY).map((t) => t.id)).toEqual(["c", "b", "d", "a"]);
  });
});

describe("pickAsks (PRODUCT_SPEC.md §8.3.4)", () => {
  const five = ["t1", "t2", "t3", "t4", "t5"].map((id) => carried(id, 3));

  it("with five tasks at the threshold, asks on the first two in carried order", () => {
    expect([...pickAsks(five, { carryAskAfter: 3 }, record())]).toEqual(["t1", "t2"]);
    expect(ASKS_PER_DAY).toBe(2);
  });

  it("only tasks at the threshold ask, and a new threshold applies at once", () => {
    const list = [carried("x", 2), carried("y", 4)];
    expect([...pickAsks(list, { carryAskAfter: 3 }, record())]).toEqual(["y"]);
    expect([...pickAsks(list, { carryAskAfter: 2 }, record())]).toEqual(["x", "y"]);
    expect([...pickAsks(list, { carryAskAfter: 5 }, record())]).toEqual([]);
  });

  it("a task asked earlier today keeps its ask and counts toward the two", () => {
    expect([...pickAsks(five, { carryAskAfter: 3 }, record(["t3"], { t3: "2026-10-06T07:00:00Z" }))].sort()).toEqual(["t1", "t3"]);
  });

  it("asks answered earlier today (gone from the list) still use up the day's two", () => {
    expect([...pickAsks(five, { carryAskAfter: 3 }, record(["gone"], { gone: "2026-10-06T07:00:00Z" }))]).toEqual(["t1"]);
    expect([...pickAsks(five, { carryAskAfter: 3 }, record(["gone", "gone2"]))]).toEqual([]);
  });

  it("a task asked in the last seven days waits, even if it carried again; after seven days it may ask again", () => {
    const asked = { t1: "2026-10-02T09:00:00Z", t2: "2026-09-29T08:59:00Z" };
    expect([...pickAsks(five, { carryAskAfter: 3 }, record([], asked))]).toEqual(["t2", "t3"]);
  });
});
