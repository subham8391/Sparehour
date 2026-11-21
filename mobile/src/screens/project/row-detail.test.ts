import { localDate } from "@/core/time";
import type { Task } from "@/core/types";
import { rowDetail } from "./row-detail";

const today = localDate("2026-11-21");
const task = (more: Partial<Task>) => ({ id: "t1", title: "Call the bank", state: "active", doDate: null, startDate: null, carryCount: 0, ...more }) as unknown as Task;

describe("rowDetail", () => {
  it("says the day the web's day chip says, then the tags", () => {
    expect(rowDetail(task({ doDate: today.add({ days: 1 }), tags: ["calls", "money"] }), today)).toBe("Tomorrow · @calls · @money");
    expect(rowDetail(task({ state: "inbox" }), today)).toBe("Inbox");
    expect(rowDetail(task({ state: "someday" }), today)).toBe("Someday");
    expect(rowDetail(task({ startDate: localDate("2026-11-30") }), today)).toBe("Starts Mon 30 Nov");
  });

  it("leaves a carried day to the row's own count", () => {
    expect(rowDetail(task({ doDate: today.subtract({ days: 2 }), carryCount: 2 }), today)).toBeUndefined();
    expect(rowDetail(task({ doDate: today.subtract({ days: 2 }), carryCount: 2, tags: ["calls"] }), today)).toBe("@calls");
  });

  it("says the tags alone where the list is all one day already", () => {
    expect(rowDetail(task({ state: "someday", tags: ["calls"] }), today, false)).toBe("@calls");
    expect(rowDetail(task({ state: "someday" }), today, false)).toBeUndefined();
  });

  it("is nothing for a task with no day and no tags", () => {
    expect(rowDetail(task({}), today)).toBeUndefined();
  });
});
