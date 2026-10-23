// The row a quick-add draft becomes, shared by the app's TaskRepo.create and the MCP server's add_task: its state by
// PRODUCT_SPEC.md §5.1 rule 5, its miss policy (A6 and the person's default), and its keys after the last ones.
import { describe, expect, it } from "vitest";
import { localDate, localTime } from "../time";
import { emptyDraft } from "./parse";
import { draftRow } from "./draft-row";

const at = { projectId: null, areaId: null, headingId: null, defaultMissPolicy: null, lastSortKey: null, daySortAfter: null };

describe("draftRow", () => {
  it("files a line with nothing in the Inbox, and anything that dates or files it as active", () => {
    const plain = { ...emptyDraft(), title: "Buy milk" };
    expect(draftRow("t1", plain, at)).toMatchObject({ state: "inbox", do_date: null, day_sort_key: null, miss_policy: "carry", recurrence_series_id: null });
    expect(draftRow("t1", { ...plain, deadline: localDate("2026-10-30") }, at).state).toBe("active");
    expect(draftRow("t1", { ...plain, startDate: localDate("2026-10-30") }, at).state).toBe("active");
    expect(draftRow("t1", plain, { ...at, projectId: "p1", areaId: "a1" })).toMatchObject({ state: "active", project_id: "p1", area_id: null });
    expect(draftRow("t1", plain, { ...at, areaId: "a1" })).toMatchObject({ state: "active", area_id: "a1" });
  });

  it("writes the time as HH:MM, places the day's key after the given one, and starts a repeat on skip as its own series", () => {
    const row = draftRow("t1", { ...emptyDraft(), title: "Gym", doDate: localDate("2026-10-26"), doTime: localTime("07:30"), recurrenceRule: "FREQ=WEEKLY;BYDAY=MO", recurrenceMode: "fixed" }, { ...at, defaultMissPolicy: "expire", lastSortKey: "a5", daySortAfter: "a7" });
    expect(row).toMatchObject({ state: "active", do_date: "2026-10-26", do_time: "07:30", miss_policy: "skip", recurrence_series_id: "t1" });
    expect(row.sort_key > "a5").toBe(true);
    expect((row.day_sort_key as string) > "a7").toBe(true);
    expect(draftRow("t2", { ...emptyDraft(), title: "Once" }, { ...at, defaultMissPolicy: "expire" }).miss_policy).toBe("expire");
    expect(draftRow("t3", { ...emptyDraft(), title: "Once" }, { ...at, defaultMissPolicy: "nonsense" }).miss_policy).toBe("carry");
  });
});
