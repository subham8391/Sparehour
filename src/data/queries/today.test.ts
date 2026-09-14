import { describe, expect, it } from "vitest";
import { localDate } from "@/core/time";
import { dayWindowParams, monthsAround } from "./today";

describe("dayWindowParams", () => {
  it("covers the day plus one either side, as ISO dates", () => {
    expect(dayWindowParams(localDate("2026-09-15"))).toEqual(["2026-09-14", "2026-09-16"]);
  });

  it("crosses month and year boundaries", () => {
    expect(dayWindowParams(localDate("2026-01-01"))).toEqual(["2025-12-31", "2026-01-02"]);
    expect(dayWindowParams(localDate("2026-12-31"))).toEqual(["2026-12-30", "2027-01-01"]);
  });
});

describe("monthsAround", () => {
  it("asks for the month plus one either side, in stream key form", () => {
    expect(monthsAround(localDate("2026-09-15"))).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("wraps across the year edge", () => {
    expect(monthsAround(localDate("2026-01-03"))).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(monthsAround(localDate("2026-12-30"))).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("matches the first seven characters of a synced timestamp", () => {
    const synced = "2026-09-14T09:00:00Z"; // PowerSync edition-3 timestamp text
    expect(monthsAround(localDate("2026-09-14"))).toContain(synced.slice(0, 7));
  });
});
