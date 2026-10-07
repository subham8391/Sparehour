import { describe, expect, it } from "vitest";
import { localDate } from "@/core/time";
import type { TaskRow } from "@/data/schema.client";
import { logbookDays } from "./logbook-days";
import { datePresets, dayLine, filterKeys, filterLabel, filterLogbookDays, parseLogbookParams, toLogbookParams, withFilter, withoutFilter, withoutLast, type FilterContext } from "./logbook-filters";

const row = (over: Partial<TaskRow> & { id: string }): TaskRow => ({ title: over.id, state: "done", estimate_min: 30, ...over }) as TaskRow;

const days = logbookDays({
  done: [
    row({ id: "a", project_id: "p1", completed_at: "2026-10-07T09:00:00Z", estimate_min: 60 }),
    row({ id: "b", project_id: "p2", completed_at: "2026-10-07T10:00:00Z", estimate_min: 15 }),
    row({ id: "c", completed_at: "2026-10-06T10:00:00Z", estimate_min: null }),
  ],
  completions: [],
  dropped: [row({ id: "d", state: "dropped", project_id: "p1", updated_at: "2026-10-06T12:00:00Z" })],
  zone: "UTC",
  defaultEstimateMin: 30,
});

const ctx: FilterContext = {
  areaOf: (p) => ({ p1: "a1", p2: "a2" })[p] ?? null,
  tagsOf: (t) => ({ a: ["deep"], c: ["deep", "home"] })[t] ?? [],
};

const shape = (f: Parameters<typeof filterLogbookDays>[1]) =>
  filterLogbookDays(days, f, ctx, 30).map((d) => ({ day: d.day.toString(), done: d.done.map((e) => e.key), dropped: d.dropped.map((e) => e.key), minutes: d.minutes }));

describe("Logbook filters (SCREENS.md §8)", () => {
  it("with no filter everything stays", () => {
    expect(shape({})).toEqual([
      { day: "2026-10-07", done: ["b", "a"], dropped: [], minutes: 75 },
      { day: "2026-10-06", done: ["c"], dropped: ["d"], minutes: 30 },
    ]);
  });

  it("each filter narrows, and a day's counts and minutes follow it", () => {
    expect(shape({ project: "p1" })).toEqual([
      { day: "2026-10-07", done: ["a"], dropped: [], minutes: 60 },
      { day: "2026-10-06", done: [], dropped: ["d"], minutes: 0 },
    ]);
    expect(shape({ area: "a2" })).toEqual([{ day: "2026-10-07", done: ["b"], dropped: [], minutes: 15 }]);
    expect(shape({ tag: "Deep" }).map((d) => d.done)).toEqual([["a"], ["c"]]);
    expect(shape({ from: "2026-10-06", to: "2026-10-06" }).map((d) => d.day)).toEqual(["2026-10-06"]);
    expect(shape({ show: "dropped" })).toEqual([{ day: "2026-10-06", done: [], dropped: ["d"], minutes: 0 }]);
    expect(shape({ show: "done", project: "p1" })).toEqual([{ day: "2026-10-07", done: ["a"], dropped: [], minutes: 60 }]);
  });

  it("lives in the URL in the order the filters were added, malformed values left out", () => {
    const f = parseLogbookParams(new URLSearchParams("tag=deep&show=dropped&from=2026-10-01&to=bad&project=p1&show=bogus"));
    expect(f).toEqual({ tag: "deep", show: "dropped", from: "2026-10-01", project: "p1" });
    expect(toLogbookParams(f)).toBe("tag=deep&show=dropped&from=2026-10-01&project=p1");
    expect(parseLogbookParams(new URLSearchParams("show=expired"))).toEqual({});
  });

  it("a filter set again becomes the newest; Escape takes off the newest; clearing restores everything", () => {
    let f = withFilter({}, { project: "p1" });
    f = withFilter(f, { tag: "deep" });
    f = withFilter(f, { project: "p2" });
    expect(filterKeys(f)).toEqual(["tag", "project"]);
    f = withFilter(f, { from: "2026-10-01", to: "2026-10-07" });
    expect(filterKeys(f)).toEqual(["tag", "project", "dates"]);
    f = withoutLast(f)!;
    expect(f).toEqual({ tag: "deep", project: "p2" });
    expect(withoutFilter(f, "tag")).toEqual({ project: "p2" });
    expect(withoutLast({})).toBeNull();
    expect(shape(withoutFilter(withoutFilter(f, "tag"), "project"))).toEqual(shape({}));
  });

  it("names each chip", () => {
    const names = { project: (id: string) => (id === "p1" ? "Launch" : null), area: () => "Work" };
    const today = localDate("2026-10-07");
    const f = { show: "dropped" as const, project: "p1", area: "a1", tag: "deep", from: "2026-10-01", to: "2026-10-07" };
    expect(filterKeys(f).map((k) => filterLabel(k, f, names, today))).toEqual(["Dropped only", "#Launch", "Work", "@deep", "Last 7 days"]);
    expect(filterLabel("dates", { from: "2026-09-01", to: "2026-09-03" }, names, today)).toBe("2026-09-01 – 2026-09-03");
    expect(datePresets(today).map((p) => p.label)).toEqual(["Today", "Yesterday", "Last 7 days", "Last 30 days"]);
  });
});

describe("the day line (SCREENS.md §8)", () => {
  it("says the shutdown's rating and highlight, and nothing for a day without them", () => {
    expect(dayLine({ day_rating: 4, highlights: "shipped the deck" })).toBe("Rated 4/5 · Highlight: shipped the deck");
    expect(dayLine({ day_rating: 3, highlights: "  " })).toBe("Rated 3/5");
    expect(dayLine({ day_rating: null, highlights: "a walk" })).toBe("Highlight: a walk");
    expect(dayLine({ day_rating: null, highlights: null })).toBeNull();
    expect(dayLine(undefined)).toBeNull();
  });
});
