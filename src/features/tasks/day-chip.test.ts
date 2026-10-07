import { describe, expect, it } from "vitest";
import { localDate } from "@/core/time";
import { dayChip } from "./day-chip";

const today = localDate("2026-09-14"); // a Monday
const at = (doDate: string | null, over: { state?: "active" | "inbox" | "someday"; carryCount?: number } = {}) =>
  dayChip({ state: over.state ?? "active", doDate: doDate ? localDate(doDate) : null, carryCount: over.carryCount ?? 0 }, today);

describe("dayChip", () => {
  it("names the near days the way people do", () => {
    expect(at("2026-09-14")).toEqual({ label: "Today", tone: "neutral" });
    expect(at("2026-09-15")).toEqual({ label: "Tomorrow", tone: "neutral" });
    expect(at("2026-09-17")).toEqual({ label: "Thu", tone: "neutral" });
    expect(at("2026-09-20")?.label).toBe("Sun");
  });

  it("falls back to a date from a week out, with the year only when it differs", () => {
    expect(at("2026-09-21")?.label).toMatch(/^21 Sep/);
    expect(at("2027-01-05")?.label).toMatch(/^5 Jan 2027$/);
  });

  it("marks carried-over work with its count", () => {
    expect(at("2026-09-12", { carryCount: 2 })).toEqual({ label: "Carried ×2", tone: "carried" });
    expect(at("2026-09-13")).toEqual({ label: "Carried", tone: "carried" });
  });

  it("states beat dates", () => {
    expect(at("2026-09-14", { state: "someday" })).toEqual({ label: "Someday", tone: "parked" });
    expect(at(null, { state: "inbox" })).toEqual({ label: "Inbox", tone: "neutral" });
  });

  it("has no chip for an undated open task", () => {
    expect(at(null)).toBeNull();
  });

  it("says when a task not started yet starts, and steps aside on its start day", () => {
    const starting = (startDate: string, doDate: string | null = null, state: "active" | "someday" | "done" = "active") =>
      dayChip({ state, doDate: doDate ? localDate(doDate) : null, carryCount: 0, startDate: localDate(startDate) }, today);
    expect(starting("2026-10-12")).toEqual({ label: "Starts Mon 12 Oct", tone: "neutral" });
    expect(starting("2026-09-16", "2026-09-18")?.label).toBe("Starts Wed 16 Sep");
    expect(starting("2026-09-14", "2026-09-15")).toEqual({ label: "Tomorrow", tone: "neutral" });
    expect(starting("2026-09-13")).toBeNull();
    expect(starting("2026-10-12", null, "someday")?.label).toBe("Someday");
  });
});
