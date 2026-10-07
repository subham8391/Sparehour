// @vitest-environment jsdom
// Today on another day (SCREENS.md §2.1, §24): the `?day=` address, the way a day is opened, the header's words for
// it, and the words quick-add files a new task there with.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readTypedDate } from "@/core/quickadd/read-date";
import { instant, localDate } from "@/core/time";
import { dayHref, dayWords, daysAway, openDay, parseDay } from "./day-address";

const TODAY = localDate("2026-10-07");

afterEach(() => window.history.replaceState(null, "", "/"));

describe("the day's address", () => {
  it("reads a calendar date and nothing else", () => {
    expect(parseDay("2026-10-08")?.toString()).toBe("2026-10-08");
    for (const bad of [null, undefined, "", "tomorrow", "2026-13-01", "2026-02-30", "2026-10-8", "2026-10-08T09:00"]) expect(parseDay(bad)).toBeNull();
  });

  it("is plain /today for today and /today?day= for any other day, so a reload keeps it", () => {
    expect(dayHref(TODAY, TODAY)).toBe("/today");
    expect(dayHref(localDate("2026-10-08"), TODAY)).toBe("/today?day=2026-10-08");
    expect(dayHref(localDate("2026-10-01"), TODAY)).toBe("/today?day=2026-10-01");
  });

  it("on Today only the address changes; from anywhere else it goes to Today on that day", () => {
    window.history.replaceState(null, "", "/today");
    openDay(localDate("2026-10-08"), TODAY);
    expect(window.location.pathname + window.location.search).toBe("/today?day=2026-10-08");
    openDay(TODAY, TODAY, { pathname: "/today", go: () => {} });
    expect(window.location.pathname + window.location.search).toBe("/today");

    const go = vi.fn();
    openDay(localDate("2026-10-06"), TODAY, { pathname: "/inbox", go });
    expect(go).toHaveBeenCalledWith("/today?day=2026-10-06");
  });
});

describe("the stepped header", () => {
  it("names the day from today: Tomorrow, Yesterday, In 3 days, 4 days ago", () => {
    expect(daysAway(localDate("2026-10-08"), TODAY)).toBe("Tomorrow");
    expect(daysAway(localDate("2026-10-06"), TODAY)).toBe("Yesterday");
    expect(daysAway(localDate("2026-10-10"), TODAY)).toBe("In 3 days");
    expect(daysAway(localDate("2026-10-03"), TODAY)).toBe("4 days ago");
  });
});

describe("quick-add's words for the day shown", () => {
  const ctx = { now: instant("2026-10-07T08:00:00Z"), zone: "UTC" };
  it("files a new task on that day, read the way quick-add reads it", () => {
    for (const iso of ["2026-10-07", "2026-10-08", "2026-10-13", "2026-11-02", "2027-01-15"]) {
      const words = dayWords(localDate(iso), TODAY);
      expect(readTypedDate(words, ctx)?.date.toString()).toBe(iso);
    }
    expect(dayWords(localDate("2026-10-08"), TODAY)).toBe("tomorrow ");
    expect(dayWords(localDate("2026-10-13"), TODAY)).toBe("13 oct ");
  });

  it("a day that has passed takes new tasks on today", () => {
    expect(dayWords(localDate("2026-10-05"), TODAY)).toBe("today ");
  });
});
