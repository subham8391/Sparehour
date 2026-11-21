// The ribbon by the hour: every position is the web's own day geometry and every label the web's own rule; these
// check the shares a phone draws with, on the made-up day (today-fixture.ts: nine to six, 13:20).
import { NOW_MIN, todayFixture } from "./today-fixture";
import { labelsFor, minuteAtTouch, ribbonBreakdown, ribbonShape } from "./ribbon-shape";

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

describe("the breakdown a tap on the ribbon opens", () => {
  const f = todayFixture();
  const options = { bufferPct: 15, connected: true, meetings: f.meetings, blocks: f.blocks };

  it("finds the minute under a touch along the drawn day", () => {
    // Nine to six on a ribbon 270 points wide: half a point a minute.
    expect(minuteAtTouch(f.capacity, 0, 270)).toBe(540);
    expect(minuteAtTouch(f.capacity, 135, 270)).toBe(810);
    expect(minuteAtTouch(f.capacity, 270, 270)).toBe(1080);
    // Before the ribbon has been laid out there is no minute to name.
    expect(minuteAtTouch(f.capacity, 10, 0)).toBeNull();
  });

  it("names what was touched as the web names it: free time, a meeting by its title, blocks", () => {
    const b = ribbonBreakdown(f.capacity, options)!;
    expect(b.at(10, 270)).toMatchObject({ kind: "free", start: 540, end: 600, name: "Free" });
    expect(b.at(45, 270)).toMatchObject({ kind: "meeting", name: "Design review" });
    expect(b.at(100, 270)).toMatchObject({ kind: "block", name: "2 blocks" });
    expect(b.at(220, 270)).toMatchObject({ kind: "block", name: "Call the bank" });
  });

  it("says the equation a term a line, with the sentence a screen reader hears", () => {
    const b = ribbonBreakdown(f.capacity, options)!;
    expect(b.terms).toEqual(["9h working", "1h 30m in meetings", "1h 20m buffer (15% of your working day)", "3h 20m planned"]);
    expect(b.result).toBe("2h 50m spare");
    expect(b.sentence).toBe("9h working − 1h 30m in meetings − 1h 20m buffer (15% of your working day) − 3h 20m planned = 2h 50m spare");
    // Without a calendar the meetings are left out: they cannot be known.
    expect(ribbonBreakdown(f.capacity, { ...options, connected: false })!.terms).not.toContain("1h 30m in meetings");
  });

  it("a touch on the over-tail, past the day's far edge, is the overrun", () => {
    const over = todayFixture({ state: "over" });
    const b = ribbonBreakdown(over.capacity, { ...options, meetings: over.meetings, blocks: over.blocks })!;
    expect(b.result).toBe("1h 25m over");
    expect(b.at(299, 300)).toMatchObject({ kind: "over", name: "1h 25m more than fits" });
    // The day itself is drawn up to the tail, so its last free stretch ends before it.
    expect(b.at(230, 300)).toMatchObject({ kind: "free" });
  });

  it("is nothing on a day without working hours", () => {
    expect(ribbonBreakdown(todayFixture({ state: "off" }).capacity, options)).toBeNull();
  });
});
