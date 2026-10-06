import { describe, expect, it } from "vitest";
import { localDate, localTime } from "../time";
import type { Priority } from "../types";
import { taskFixture } from "@/test/fixtures";
import { TODAY_SORTS, isTodaySort, sortToday } from "./sort";

const list = [
  taskFixture("a", "Answer email", { daySortKey: "a0", estimateMin: 15, priority: 0 as Priority }),
  taskFixture("b", "Budget review", { daySortKey: "a1", doTime: localTime("14:00"), deadline: localDate("2026-09-20"), estimateMin: 90, priority: 1 as Priority }),
  taskFixture("c", "Call the bank", { daySortKey: "a2", doTime: localTime("09:30"), estimateMin: null, priority: 3 as Priority }),
  taskFixture("d", "Draft the proposal", { daySortKey: "a3", deadline: localDate("2026-09-16"), estimateMin: 120, priority: 2 as Priority }),
];
const ids = (xs: readonly { id: string }[]) => xs.map((t) => t.id);

describe("sortToday (SCREENS.md §2.4 Order)", () => {
  it("offers Manual, Time, Priority, Deadline and Estimate", () => {
    expect(TODAY_SORTS.map((s) => s.label)).toEqual(["Manual", "Time", "Priority", "Deadline", "Estimate"]);
    expect(isTodaySort("time")).toBe(true);
    expect(isTodaySort("title")).toBe(false);
  });

  it("time: timed rows first in clock order, the rest in hand order", () => {
    expect(ids(sortToday(list, "time"))).toEqual(["c", "b", "a", "d"]);
  });

  it("priority: high first, none last", () => {
    expect(ids(sortToday(list, "priority"))).toEqual(["c", "d", "b", "a"]);
  });

  it("deadline: soonest first, undated after in hand order", () => {
    expect(ids(sortToday(list, "deadline"))).toEqual(["d", "b", "a", "c"]);
  });

  it("estimate: largest first, an unset estimate counted as the default", () => {
    expect(ids(sortToday(list, "estimate", 30))).toEqual(["d", "b", "c", "a"]);
  });

  it("never rewrites a day key, never reorders its input, and Manual gives the hand order back", () => {
    const keys = list.map((t) => t.daySortKey);
    const sorted = sortToday(list, "priority");
    expect(sorted).not.toBe(list);
    expect(list.map((t) => t.daySortKey)).toEqual(keys);
    expect(sorted.map((t) => t.daySortKey).sort()).toEqual(keys);
    expect(ids(sortToday(list, "manual"))).toEqual(["a", "b", "c", "d"]);
  });
});
