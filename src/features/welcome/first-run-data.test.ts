import { describe, expect, it, vi } from "vitest";
import { NONE, calendarSettled, refusalOf, writeHours } from "./first-run-data";

const NINE = [{ start: "09:00", end: "18:00" }];
const WEEK = [NINE, NINE, NINE, NINE, NINE, [], []];

describe("writeHours", () => {
  const repos = () => ({ settings: { update: vi.fn(async () => undefined) }, hours: { replaceDay: vi.fn(async () => undefined) } });
  const ctx = { spaceId: "sp1", userId: "u1" };

  it("writes the zone and each day only where they differ", async () => {
    const r = repos();
    await writeHours(r, "s1", ctx, { zone: "Europe/London", week: [NINE, NINE, NINE, NINE, [], NINE, []] }, { zone: "UTC", week: WEEK });
    expect(r.settings.update).toHaveBeenCalledWith("s1", { timezone: "Europe/London" });
    expect(r.hours.replaceDay.mock.calls).toEqual([
      [4, [], ctx],
      [5, NINE, ctx],
    ]);
  });

  it("writes nothing when nothing changed", async () => {
    const r = repos();
    await writeHours(r, "s1", ctx, { zone: "UTC", week: WEEK }, { zone: "UTC", week: WEEK });
    expect(r.settings.update).not.toHaveBeenCalled();
    expect(r.hours.replaceDay).not.toHaveBeenCalled();
  });
});

describe("calendarSettled", () => {
  const open = { answered: false, connections: 0, outcome: null, can: { google: true, microsoft: false } };

  it("is not settled while a calendar can be connected and nothing has been answered, or while that is not known yet", () => {
    expect(calendarSettled(open)).toBe(false);
    expect(calendarSettled({ ...open, can: null })).toBe(false);
    expect(calendarSettled({ ...open, outcome: "denied" })).toBe(false);
  });

  it("is settled by a skip, a connection, or a server that can connect none", () => {
    expect(calendarSettled({ ...open, answered: true })).toBe(true);
    expect(calendarSettled({ ...open, connections: 1 })).toBe(true);
    expect(calendarSettled({ ...open, outcome: "connected" })).toBe(true);
    expect(calendarSettled({ ...open, outcome: "unavailable" })).toBe(true);
    expect(calendarSettled({ ...open, can: NONE })).toBe(true);
  });
});

describe("refusalOf", () => {
  it("names only the answers the step has a line for", () => {
    expect(refusalOf("denied")).toBe("denied");
    expect(refusalOf("error")).toBe("error");
    expect(refusalOf("no_read")).toBe("no_read");
    expect(refusalOf("connected")).toBeNull();
    expect(refusalOf(null)).toBeNull();
  });
});
