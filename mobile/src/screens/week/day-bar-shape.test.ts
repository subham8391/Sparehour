// Where the week's capacity bar puts its parts, from the shared engine's own answer for the reference day.
import { capacityFor } from "@/core/capacity";
import { DAY, REFERENCE_DAY, SETTINGS, WORK_HOURS, task } from "@/core/capacity/__fixtures__/reference-day";
import { dayReadout } from "@/features/upcoming/week";
import { dayBarShape } from "./day-bar-shape";

describe("dayBarShape", () => {
  it("lays meetings and blocks on a track from the day's first hour to its last, as shares of it", () => {
    const c = capacityFor(REFERENCE_DAY);
    const shape = dayBarShape(c, dayReadout(c, true));
    if (shape.kind === "off") throw new Error("the reference day has working hours");
    expect(shape.kind).toBe("spare");
    expect(shape.tail).toBe(0);
    expect(shape.segments.filter((s) => s.kind === "meeting")).toHaveLength(c.busy.length);
    expect(shape.segments.filter((s) => s.kind === "block")).toHaveLength(c.blocks.length);
    const span = c.windows[c.windows.length - 1].end - c.windows[0].start;
    expect(shape.segments[0]).toEqual({ kind: "meeting", left: ((c.busy[0].start - c.windows[0].start) / span) * 100, width: ((c.busy[0].end - c.busy[0].start) / span) * 100 });
    for (const s of shape.segments) {
      expect(s.left).toBeGreaterThanOrEqual(0);
      expect(s.left + s.width).toBeLessThanOrEqual(100);
    }
  });

  it("an over day grows a tail past the end, never more than a fifth of the bar", () => {
    const wed = DAY.add({ days: 1 });
    const input = { day: wed, settings: SETTINGS, workHours: WORK_HOURS, events: [], blocks: [] };
    const little = capacityFor({ ...input, tasks: [task("a", 480, { doDate: wed })] });
    const readout = dayReadout(little, false);
    expect(readout.kind).toBe("over");
    const shape = dayBarShape(little, readout);
    expect(shape).toMatchObject({ kind: "over", tail: (readout.min / 540) * 100 });
    const wild = capacityFor({ ...input, tasks: [task("a", 2000, { doDate: wed })] });
    expect(dayBarShape(wild, dayReadout(wild, false))).toMatchObject({ kind: "over", tail: 20 });
  });

  it("a day without working hours is a flat track", () => {
    const sat = capacityFor({ day: DAY.add({ days: 4 }), settings: SETTINGS, workHours: WORK_HOURS, events: [], blocks: [], tasks: [] });
    expect(dayBarShape(sat, dayReadout(sat, false))).toEqual({ kind: "off" });
  });
});
