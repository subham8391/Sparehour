// The Day timeline's layout on the made-up day (today-fixture.ts: nine to six, 13:20): the web's own scale, lanes,
// gaps and names, turned into the points a phone draws with.
import { NOW_MIN, todayFixture } from "./today-fixture";
import { laneBox, timelineShape } from "./timeline-shape";

const shape = (over: Partial<Parameters<typeof timelineShape>[0]> = {}, fixture = todayFixture()) => timelineShape({ c: fixture.capacity, nowMin: NOW_MIN, nowShown: true, blocks: fixture.blocks, meetings: fixture.meetings, zoom: 30, ...over });

describe("timelineShape", () => {
  it("draws the whole 24 hours at the zoom's scale: 66 points an hour at 30-minute rows, twice that at 15, six times at 5", () => {
    expect(shape().height).toBeCloseTo(24 * 66);
    expect(shape({ zoom: 15 }).height).toBeCloseTo(24 * 132);
    expect(shape({ zoom: 5 }).height).toBeCloseTo(24 * 396);
    expect(shape().hours).toHaveLength(24);
    expect(shape().rows).toHaveLength(24);
    expect(shape({ zoom: 5 }).rows).toHaveLength(24 * 11);
    // A quiet label at each quarter, only at the 5-minute zoom.
    expect(shape({ zoom: 5 }).rows.find((r) => r.minute === 9 * 60 + 15)?.label).toBe("09:15");
    expect(shape({ zoom: 15 }).rows.every((r) => r.label === null)).toBe(true);
  });

  it("dims the hours outside the working day, and opens on the working day or on now once it is well under way", () => {
    const s = shape();
    expect(s.outside).toHaveLength(2);
    expect(s.outside[0]).toEqual({ top: 0, height: 9 * 66 });
    expect(s.outside[1].top).toBeCloseTo(18 * 66);
    expect(s.outside[1].height).toBeCloseTo(6 * 66);
    expect(s.workEnd).toBeCloseTo(18 * 66);
    // 13:20 is not yet six hours past the stretch it opens on (08:00), so it opens there.
    expect(s.openAt).toBe(8 * 60);
    expect(shape({ nowMin: 16 * 60 }).openAt).toBe(16 * 60 - 90);
    expect(shape({ nowShown: false, nowMin: 0 }).openAt).toBe(8 * 60);
  });

  it("names a meeting by its one event, says when it is not answered yet, and lets the past down", () => {
    const [review, one] = shape().meetings;
    expect(review).toMatchObject({ title: "Design review", past: true, unanswered: false, tall: true, time: "10:00–11:00 · 1h" });
    expect(one).toMatchObject({ title: "1:1 with Ana", past: false, unanswered: true, tall: false, time: "15:00" });
    expect(review.top).toBeCloseTo(10 * 66 + 1);
    expect(shape({ meetings: [] }).meetings[0].title).toBe("Busy");
  });

  it("draws each block with its task's title, its lock and what a screen reader hears", () => {
    const blocks = shape().blocks;
    expect(blocks.map((b) => b.says)).toEqual(["Block: Write the quarterly report for the board, 11:00 to 12:30", "Block: Lunch, 12:30 to 13:00, locked", "Block: Call the bank, 16:00 to 16:35, will sync"]);
    expect(blocks[0]).toMatchObject({ quiet: true, tall: true, time: "11:00–12:30 · 1h 30m" });
    expect(blocks[2]).toMatchObject({ quiet: false });
    expect(blocks[2].top).toBeCloseTo(16 * 66 + 1);
    const fixture = todayFixture();
    const done = shape({ blocks: [{ ...fixture.blocks[2], done: true }] }).blocks[0];
    expect(done).toMatchObject({ quiet: true, says: "Block: Call the bank, 16:00 to 16:35, done, will sync" });
  });

  it("names the free gaps still ahead by what is left of them, never the part already gone", () => {
    const gaps = shape().gaps;
    // 13:20 to the 15:00 meeting, the half hour after it, and what is left once the plan is done (16:35).
    expect(gaps.map((g) => g.label)).toEqual(["1h 40m free", "30m free", "1h 25m free · after the plan"]);
    expect(gaps[0].top).toBeCloseTo(NOW_MIN * 1.1 + 1);
    expect(shape().freeAt).toBe(NOW_MIN);
  });

  it("draws the now line on today only, and its time takes the place of an hour label it would sit on", () => {
    expect(shape().now).toEqual({ top: NOW_MIN * 1.1, label: "13:20" });
    expect(shape({ nowShown: false, nowMin: 0 }).now).toBeNull();
    expect(shape({ nowMin: 13 * 60 + 5 }).hours[13].label).toBeNull();
    expect(shape().hours[13].label).toBe("13:00");
  });

  it("marks the projected finish, or pins how far the plan runs past the end of the day", () => {
    const open = shape();
    expect(open.finish?.label).toMatch(/^done by \d\d:\d\d$/);
    expect(open.overrun).toBeNull();
    const over = shape({}, todayFixture({ state: "over" }));
    expect(over.finish).toBeNull();
    expect(over.overrun?.label).toMatch(/past the end of your day$/);
    expect(over.overrun?.top).toBeCloseTo(18 * 66 + 4);
  });

  it("puts things that overlap side by side", () => {
    const fixture = todayFixture();
    const s = shape({ blocks: [{ ...fixture.blocks[2], start: 10 * 60, end: 10 * 60 + 30 }] });
    // A block put on the 10:00 meeting: the two share the width, the shorter one first.
    expect(laneBox(s.blocks[0].lane)).toEqual({ left: "0%", width: "50%" });
    expect(laneBox(s.meetings[0].lane)).toEqual({ left: "50%", width: "50%" });
    expect(laneBox(undefined)).toEqual({ left: "0%", width: "100%" });
  });
});
