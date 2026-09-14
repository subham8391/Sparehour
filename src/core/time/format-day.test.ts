import { describe, expect, it } from "vitest";
import { localDate } from "./index";
import { formatDay, monthName, weekdayName } from "./format-day";

describe("formatDay", () => {
  const thu = localDate("2026-09-17");

  it("writes dates the way the interface does", () => {
    expect(formatDay(thu)).toBe("Thu 17 Sep");
    expect(formatDay(thu, { weekday: "long" })).toBe("Thursday 17 Sep");
    expect(formatDay(thu, { weekday: "long", month: "long" })).toBe("Thursday 17 September");
    expect(formatDay(thu, { weekday: "none" })).toBe("17 Sep");
  });

  it("adds the year only when asked or when it differs from today", () => {
    expect(formatDay(thu, { year: true })).toBe("Thu 17 Sep 2026");
    expect(formatDay(thu, { today: localDate("2026-01-01") })).toBe("Thu 17 Sep");
    expect(formatDay(localDate("2027-01-05"), { today: thu })).toBe("Tue 5 Jan 2027");
    expect(formatDay(localDate("2027-01-05"), { today: thu, year: false })).toBe("Tue 5 Jan");
  });

  it("never says Sept", () => {
    expect(monthName(thu)).toBe("Sep");
    expect(monthName(thu, "long")).toBe("September");
    expect(weekdayName(localDate("2026-09-13"), "long")).toBe("Sunday");
  });
});
