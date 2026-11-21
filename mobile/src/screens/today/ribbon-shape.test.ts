// The ribbon by the hour: every position is the web's own day geometry and every label the web's own rule; these
// check the shares a phone draws with, on the made-up day (today-fixture.ts: nine to six, 13:20).
import { NOW_MIN, todayFixture } from "./today-fixture";
import { labelsFor, ribbonShape } from "./ribbon-shape";

const share = (hhmm: string) => ((Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) - 540) / 540) * 100;

describe("ribbonShape", () => {
  it("puts meetings, an unanswered invitation and blocks at their own hours of the working day", () => {
    const shape = ribbonShape(todayFixture().capacity, NOW_MIN)!;
    const at = (kind: string) => shape.segments.filter((s) => s.kind === kind).map((s) => [Math.round(s.left * 10) / 10, Math.round(s.width * 10) / 10]);
    const span = (from: string, to: string) => [Math.round(share(from) * 10) / 10, Math.round((share(to) - share(from)) * 10) / 10];
    expect(at("meeting")).toEqual([span("10:00", "11:00"), span("15:00", "15:30")]);
    expect(at("unanswered")).toEqual([span("15:00", "15:30")]);
    expect(at("block")).toEqual([span("11:00", "13:00"), span("16:00", "16:35")]);
  });

  it("marks what has gone and now on today, and neither on another day", () => {
    const today = ribbonShape(todayFixture().capacity, NOW_MIN)!;
    expect(today.elapsed).toBeCloseTo(share("13:20"));
    expect(today.now).toBeCloseTo(share("13:20"));
    const other = ribbonShape(todayFixture({ now: false }).capacity)!;
    expect(other.elapsed).toBe(0);
    expect(other.now).toBeNull();
  });

  it("ticks every whole hour, and labels them with the now time in the place of the hours it would sit on", () => {
    const shape = ribbonShape(todayFixture().capacity, NOW_MIN)!;
    expect(shape.ticks).toHaveLength(10);
    expect(shape.ticks[0]).toBe(0);
    expect(shape.ticks[9]).toBe(100);
    const wide = labelsFor(shape, 400).map((l) => l.text);
    expect(wide).toContain("13:20");
    // 13:00 is within the now label's berth and gives way to it; 09 and 18 hold the two ends.
    expect(wide).not.toContain("13");
    expect(wide[0]).toBe("09");
    expect(shape.labels.find((l) => l.text === "09")?.align).toBe("start");
    expect(shape.labels.find((l) => l.text === "18")?.align).toBe("end");
    // A phone's track is narrow: only every second hour is labelled, and a cursor clears a wider berth.
    const narrow = labelsFor(shape, 300).map((l) => l.text);
    expect(narrow.length).toBeLessThan(wide.length);
    expect(narrow).toContain("13:20");
    expect(narrow).not.toContain("14");
  });

  it("names the projected finish, and grows a tail when the plan runs past the day, capped at a fifth of the card", () => {
    const open = ribbonShape(todayFixture().capacity, NOW_MIN)!;
    expect(open.tail).toBe(0);
    expect(open.finish).not.toBeNull();
    expect(open.labels.some((l) => l.kind === "finish")).toBe(true);
    const over = ribbonShape(todayFixture({ state: "over" }).capacity, NOW_MIN)!;
    expect(over.tail).toBeGreaterThan(0);
    expect(over.tail).toBeLessThanOrEqual(20);
    expect(over.finish).toBeNull();
  });

  it("has nothing to draw on a day without working hours", () => {
    expect(ribbonShape(todayFixture({ state: "off" }).capacity)).toBeNull();
  });
});
