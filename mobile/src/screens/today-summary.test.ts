// The hero card's words come straight from the shared capacity engine's result: nothing is summed again here.
import type { Capacity } from "@/core/capacity";
import { todaySummary } from "./today-summary";

const cap = (over: Partial<Capacity>): Capacity =>
  ({ state: "ok", reason: null, workMin: 480, busyMin: 60, gapMin: 0, bufferMin: 72, committedMin: 90, unscheduledMin: 65, spareMin: 193, overMin: 0, projectedFinish: null, ...over }) as unknown as Capacity;

describe("todaySummary", () => {
  it("says nothing until the day is known, and names a day with no hours or out of office", () => {
    expect(todaySummary(null)).toEqual({ kind: "none", line: "" });
    expect(todaySummary(cap({ state: "no_work_day", reason: "no_hours" } as never))).toEqual({ kind: "none", line: "No working hours today" });
    expect(todaySummary(cap({ state: "no_work_day", reason: "out_of_office" } as never))).toEqual({ kind: "none", line: "Out of office today" });
  });

  it("gives the engine's spare figure, what is planned and in meetings, and the day in its parts", () => {
    const s = todaySummary(cap({}));
    expect(s).toMatchObject({ kind: "spare", figure: "3h 13m", line: "2h 35m planned · 1h in meetings" });
    if (s.kind === "none") throw new Error("expected a figure");
    expect(s.shares.busy).toBeCloseTo(60 / 480);
    expect(s.shares.planned).toBeCloseTo(155 / 480);
    expect(s.shares.buffer).toBeCloseTo(72 / 480);
    expect(s.shares.spare).toBeCloseTo(193 / 480);
  });

  it("counts gaps too short to use with the meetings on the bar, as the engine takes them out of spare time", () => {
    const s = todaySummary(cap({ gapMin: 20 }));
    if (s.kind === "none") throw new Error("expected a figure");
    expect(s.shares.busy).toBeCloseTo(80 / 480);
  });

  it("an empty day says so, and a day over says by how much with no spare on the bar", () => {
    expect(todaySummary(cap({ committedMin: 0, unscheduledMin: 0, busyMin: 0, spareMin: 408 }))).toMatchObject({ kind: "spare", figure: "6h 48m", line: "nothing planned yet" });
    const over = todaySummary(cap({ committedMin: 300, unscheduledMin: 220, spareMin: 0, overMin: 70 }));
    expect(over).toMatchObject({ kind: "over", figure: "1h 10m", line: "8h 40m planned · 1h in meetings" });
    if (over.kind === "none") throw new Error("expected a figure");
    expect(over.shares.spare).toBe(0);
    // A share never runs past the bar.
    expect(over.shares.planned).toBe(1);
  });
});
