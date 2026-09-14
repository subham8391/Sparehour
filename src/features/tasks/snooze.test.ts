import { describe, expect, it } from "vitest";
import { instant, localDate } from "@/core/time";
import { inFourHours, nextMonday, nextSaturday, snoozePresets } from "./snooze";

describe("snooze presets", () => {
  const today = localDate("2026-09-14"); // Monday
  const now = instant("2026-09-14T08:03:00Z"); // 09:03 in London (BST)

  it("offers the five presets in the spec's order with their patches", () => {
    const presets = snoozePresets(now, "Europe/London", today);
    expect(presets.map((p) => p.label)).toEqual(["This evening", "Tomorrow", "In 4 hours", "This weekend", "Next week"]);
    expect(presets[0].patch).toEqual({ doDate: today, doTime: null, evening: true });
    expect(presets[1].patch.doDate.toString()).toBe("2026-09-15");
    expect(presets[3].patch.doDate.toString()).toBe("2026-09-19");
    expect(presets[4].patch.doDate.toString()).toBe("2026-09-21");
  });

  it("in four hours rounds up to five minutes in the user's zone", () => {
    const r = inFourHours(now, "Europe/London");
    expect(r.doDate.toString()).toBe("2026-09-14");
    expect(r.doTime.toString({ smallestUnit: "minute" })).toBe("13:05");
    const late = inFourHours(instant("2026-09-14T21:00:00Z"), "Europe/London"); // 22:00 BST
    expect(late.doDate.toString()).toBe("2026-09-15");
    expect(late.doTime.toString({ smallestUnit: "minute" })).toBe("02:00");
  });

  it("this weekend is the next Saturday, even on a Saturday", () => {
    expect(nextSaturday(localDate("2026-09-14")).toString()).toBe("2026-09-19");
    expect(nextSaturday(localDate("2026-09-19")).toString()).toBe("2026-09-26");
    expect(nextSaturday(localDate("2026-09-20")).toString()).toBe("2026-09-26");
  });

  it("next week is the next Monday, even on a Monday", () => {
    expect(nextMonday(localDate("2026-09-14")).toString()).toBe("2026-09-21");
    expect(nextMonday(localDate("2026-09-18")).toString()).toBe("2026-09-21");
    expect(nextMonday(localDate("2026-09-20")).toString()).toBe("2026-09-21");
  });
});
