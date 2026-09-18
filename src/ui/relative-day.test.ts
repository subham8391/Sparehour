import { describe, expect, it } from "vitest";
import { localDate } from "@/core/time";
import { deadlineWording, relativeDay } from "./relative-day";

const today = localDate("2026-09-17"); // a Thursday

describe("relativeDay", () => {
  it("names the near days and falls back to a human date", () => {
    expect(relativeDay(localDate("2026-09-17"), today)).toBe("Today");
    expect(relativeDay(localDate("2026-09-18"), today)).toBe("Tomorrow");
    expect(relativeDay(localDate("2026-09-16"), today)).toBe("Yesterday");
    expect(relativeDay(localDate("2026-09-19"), today)).toBe("Sat");
    expect(relativeDay(localDate("2026-09-23"), today)).toBe("Wed");
    expect(relativeDay(localDate("2026-09-24"), today)).toBe("24 Sep");
    expect(relativeDay(localDate("2027-01-05"), today)).toBe("5 Jan 2027");
  });
});

describe("deadlineWording", () => {
  it("is ember only when the deadline is today, passed or within two days", () => {
    expect(deadlineWording(localDate("2026-09-17"), today)).toEqual({ label: "Today", near: true });
    expect(deadlineWording(localDate("2026-09-18"), today)).toEqual({ label: "Tomorrow", near: true });
    expect(deadlineWording(localDate("2026-09-19"), today)).toEqual({ label: "Sat", near: true });
    expect(deadlineWording(localDate("2026-09-20"), today)).toEqual({ label: "Sun", near: false });
    expect(deadlineWording(localDate("2026-09-22"), today)).toEqual({ label: "Tue", near: false });
    expect(deadlineWording(localDate("2026-10-02"), today)).toEqual({ label: "2 Oct", near: false });
  });

  it("says how late, never overdue", () => {
    expect(deadlineWording(localDate("2026-09-15"), today)).toEqual({ label: "2d late", near: true });
    expect(deadlineWording(localDate("2026-09-16"), today)).toEqual({ label: "1d late", near: true });
  });
});
