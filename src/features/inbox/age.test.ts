import { describe, expect, it } from "vitest";
import { localDate } from "@/core/time";
import { addedLabel } from "./age";

describe("addedLabel (SCREENS.md §5 'Age is shown in days, factually')", () => {
  const today = localDate("2026-10-07");
  it("says today for anything captured on the person's today, in their zone", () => {
    expect(addedLabel("2026-10-07T06:00:00Z", today, "Europe/London")).toBe("added today");
    // 23:30 UTC on the 6th is already the 7th in Berlin.
    expect(addedLabel("2026-10-06 23:30:00+00", today, "Europe/Berlin")).toBe("added today");
  });
  it("counts whole days back", () => {
    expect(addedLabel("2026-10-06T12:00:00Z", today, "UTC")).toBe("added 1d");
    expect(addedLabel("2026-10-05T12:00:00Z", today, "UTC")).toBe("added 2d");
    expect(addedLabel("2026-09-01T12:00:00Z", today, "UTC")).toBe("added 36d");
  });
  it("is quiet about what it cannot read, and never counts the future", () => {
    expect(addedLabel(null, today, "UTC")).toBeNull();
    expect(addedLabel("not a date", today, "UTC")).toBeNull();
    expect(addedLabel("2026-10-09T12:00:00Z", today, "UTC")).toBe("added today");
  });
});
