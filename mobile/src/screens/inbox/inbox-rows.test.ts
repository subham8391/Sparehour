// The quiet line under an Inbox row's title: its project when it has one, and its age in the web's own words.
import { localDate } from "@/core/time";
import type { TaskRow } from "@/data/schema.client";
import { inboxRows } from "./inbox-rows";

const row = (over: Partial<TaskRow>): TaskRow => ({ id: "t1", title: "Call the bank", state: "inbox", created_at: "2026-11-19T10:00:00Z", ...over }) as TaskRow;
const today = localDate("2026-11-21");

describe("inboxRows", () => {
  it("keeps the order it is given and says each row's age in days", () => {
    const rows = inboxRows([row({ id: "a", created_at: "2026-11-21T08:00:00Z" }), row({ id: "b" })], new Map(), today, "UTC");
    expect(rows.map((r) => [r.task.id, r.detail])).toEqual([
      ["a", "added today"],
      ["b", "added 2d"],
    ]);
  });

  it("names the project before the age, and says nothing for a row with neither", () => {
    const names = new Map([["p1", "Acme"]]);
    expect(inboxRows([row({ project_id: "p1" })], names, today, "UTC")[0].detail).toBe("Acme · added 2d");
    expect(inboxRows([row({ created_at: null })], names, today, "UTC")[0].detail).toBe("");
  });

  it("counts the age from the day it was captured in the account's zone", () => {
    // 23:30 UTC on the 19th is already the 20th in Kolkata: one day ago there, two in UTC.
    const late = row({ created_at: "2026-11-19T23:30:00Z" });
    expect(inboxRows([late], new Map(), today, "Asia/Kolkata")[0].detail).toBe("added 1d");
    expect(inboxRows([late], new Map(), today, "UTC")[0].detail).toBe("added 2d");
  });
});
