import { describe, expect, it } from "vitest";
import { localDate } from "@/core/time";
import { dayRangeParams, monthsBack } from "./views";

describe("dayRangeParams", () => {
  it("covers a rolling week inclusively", () => {
    expect(dayRangeParams(localDate("2026-09-14"), 7)).toEqual(["2026-09-14", "2026-09-20"]);
  });

  it("a single day is its own range", () => {
    expect(dayRangeParams(localDate("2026-09-14"), 1)).toEqual(["2026-09-14", "2026-09-14"]);
    expect(dayRangeParams(localDate("2026-09-14"), 0)).toEqual(["2026-09-14", "2026-09-14"]);
  });
});

describe("monthsBack", () => {
  it("lists the current month first, then the months before it", () => {
    expect(monthsBack(localDate("2026-02-10"), 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
  });

  it("always includes the current month", () => {
    expect(monthsBack(localDate("2026-09-14"), 0)).toEqual(["2026-09"]);
  });
});
