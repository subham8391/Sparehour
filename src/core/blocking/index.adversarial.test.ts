// Adversarial tests for the time-blocking arithmetic: tiny durations, the
// edges of the day, degenerate scales, unsorted gaps and a property over
// chooseSlot.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MIN_BLOCK_MIN, blockLength, chooseSlot, clampMinute, minuteAtOffset, nextFreeGap, overlaps, placeAt, resizeEnd, snapTo } from "./index";

describe("placeAt", () => {
  it("never starts before midnight, even for a duration under five minutes at the start of the day", () => {
    for (const [start, dur] of [[0, 3], [0, 0], [2, 1], [0, 4]]) {
      const b = placeAt(start, dur);
      expect(b.start, `placeAt(${start}, ${dur}) → ${JSON.stringify(b)}`).toBeGreaterThanOrEqual(0);
      expect(b.end).toBeGreaterThanOrEqual(b.start);
    }
  });

  it("pins a block to the end of the day and keeps at least five minutes", () => {
    expect(placeAt(1440, 30)).toEqual({ start: 1435, end: 1440 });
    expect(placeAt(1438, 60)).toEqual({ start: 1435, end: 1440 });
    expect(placeAt(9999, 60)).toEqual({ start: 1435, end: 1440 });
    expect(placeAt(-100, 30)).toEqual({ start: 0, end: 30 });
    expect(placeAt(603, 47)).toEqual({ start: 605, end: 652 }); // the duration itself is not snapped
  });
});

describe("resizeEnd", () => {
  it("clamps to the day and to five minutes after the start", () => {
    expect(resizeEnd({ start: 600, end: 660 }, -50)).toEqual({ start: 600, end: 605 });
    expect(resizeEnd({ start: 600, end: 660 }, 602)).toEqual({ start: 600, end: 605 });
    expect(resizeEnd({ start: 600, end: 660 }, 607)).toEqual({ start: 600, end: 605 });
    expect(resizeEnd({ start: 600, end: 660 }, 608)).toEqual({ start: 600, end: 610 });
    expect(resizeEnd({ start: 1437, end: 1440 }, 1500)).toEqual({ start: 1437, end: 1440 }); // cannot honour 5 min at the very end
  });
});

describe("nextFreeGap and chooseSlot", () => {
  const free = [
    { start: 630, end: 720 },
    { start: 540, end: 600 },
    { start: 780, end: 1080 },
  ]; // deliberately unsorted

  it("sorts the gaps, snaps `from` up or down, and accepts a gap exactly the right size", () => {
    expect(nextFreeGap(free, 543, 45)).toEqual({ start: 545, end: 590 });
    expect(nextFreeGap(free, 542, 45)).toEqual({ start: 540, end: 585 });
    expect(nextFreeGap(free, 540, 60)).toEqual({ start: 540, end: 600 });
    expect(nextFreeGap(free, 540, 61)).toEqual({ start: 630, end: 691 });
    expect(nextFreeGap(free, -50, 30)).toEqual({ start: 540, end: 570 });
    expect(nextFreeGap(free, 1080, 5)).toBeNull();
    expect(nextFreeGap(free, 1075, 5)).toEqual({ start: 1075, end: 1080 });
  });

  it("chooseSlot: a remaining sliver under five minutes is not a slot; a request past the day still lands inside it", () => {
    expect(chooseSlot([{ start: 540, end: 600 }], 598, 30, 1080)).toEqual({ start: 1080, end: 1110 });
    expect(chooseSlot([{ start: 540, end: 600 }], 594, 30, 1080)).toEqual({ start: 595, end: 600 }); // 5-minute sliver, shrunk to fit
    expect(chooseSlot([], 1500, 60, 1080)).toEqual({ start: 1435, end: 1440 });
    expect(chooseSlot([], 0, 60, 0)).toEqual({ start: 0, end: 60 });
    expect(chooseSlot([], 0, 60, 1437)).toEqual({ start: 1435, end: 1440 }); // snapped day end 1435, pinned to the last five minutes
  });

  it("chooseSlot picks the widest remaining gap, and the first of equals in input order", () => {
    const gaps = [{ start: 900, end: 930 }, { start: 600, end: 630 }];
    expect(chooseSlot(gaps, 0, 120, 1080)).toEqual({ start: 900, end: 930 });
    expect(chooseSlot([{ start: 600, end: 640 }, { start: 900, end: 930 }], 0, 120, 1080)).toEqual({ start: 600, end: 640 });
  });

  it("property: chooseSlot always returns a block inside the day with end > start, for durations ≥ five minutes", () => {
    const arbGap = fc.tuple(fc.integer({ min: 0, max: 1435 }), fc.integer({ min: 5, max: 300 })).map(([s, len]) => ({ start: s, end: Math.min(1440, s + len) }));
    fc.assert(
      fc.property(fc.array(arbGap, { maxLength: 6 }), fc.integer({ min: -100, max: 1600 }), fc.integer({ min: MIN_BLOCK_MIN, max: 600 }), fc.integer({ min: 0, max: 1440 }), (gaps, from, dur, dayEnd) => {
        const b = chooseSlot(gaps, from, dur, dayEnd);
        expect(b.start).toBeGreaterThanOrEqual(0);
        expect(b.end).toBeLessThanOrEqual(1440);
        expect(b.end - b.start).toBeGreaterThanOrEqual(MIN_BLOCK_MIN);
        expect(b.end - b.start).toBeLessThanOrEqual(Math.max(dur, MIN_BLOCK_MIN));
        const fits = nextFreeGap(gaps, from, dur);
        if (fits) expect(b).toEqual(fits);
      }),
      { numRuns: 500 },
    );
  });
});

describe("snapping and pointer maths", () => {
  it("snaps negative and huge minutes, and rounds .5 up", () => {
    expect(snapTo(-3)).toBe(-5);
    expect(snapTo(-2)).toBe(-0);
    expect(snapTo(2.5)).toBe(5);
    expect(snapTo(1e9)).toBe(1e9);
    expect(snapTo(7, 15)).toBe(0);
    expect(snapTo(8, 15)).toBe(15);
  });

  it("documents: a zero step or a zero px-per-minute scale gives NaN, not a clamped minute", () => {
    expect(Number.isNaN(snapTo(10, 0))).toBe(true);
    expect(Number.isNaN(minuteAtOffset(0, 0, 540))).toBe(true);
    expect(minuteAtOffset(10, 0, 540)).toBe(1440);
  });

  it("clamps pointer positions to the day and honours the ad-hoc 15-minute step", () => {
    expect(minuteAtOffset(1e9, 1, 540)).toBe(1440);
    expect(minuteAtOffset(-1e9, 1, 540)).toBe(0);
    expect(minuteAtOffset(7, 1, 540, 15)).toBe(540);
    expect(minuteAtOffset(8, 1, 540, 15)).toBe(555);
    expect(clampMinute(NaN)).toBeNaN();
  });

  it("blockLength: zero, negative, fractional and huge estimates", () => {
    expect(blockLength(0, 30)).toBe(5);
    expect(blockLength(-10, 30)).toBe(5);
    expect(blockLength(2.5, 30)).toBe(5);
    expect(blockLength(7, 30)).toBe(5);
    expect(blockLength(8, 30)).toBe(10);
    expect(blockLength(1e6, 30)).toBe(1e6); // no ceiling here; the capacity engine reports the spill
    expect(blockLength(null, 0)).toBe(5);
  });

  it("overlaps treats zero-length and adjacent intervals as disjoint", () => {
    expect(overlaps({ start: 600, end: 600 }, { start: 600, end: 700 })).toBe(false);
    expect(overlaps({ start: 600, end: 660 }, { start: 660, end: 700 })).toBe(false);
    expect(overlaps({ start: 600, end: 660 }, { start: 600, end: 660 })).toBe(true);
    expect(overlaps({ start: 600, end: 660 }, { start: 659, end: 700 })).toBe(true);
  });
});
