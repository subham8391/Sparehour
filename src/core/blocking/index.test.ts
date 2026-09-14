import { describe, expect, it } from "vitest";
import { blockLength, chooseSlot, minuteAtOffset, nextFreeGap, overlaps, placeAt, resizeEnd, snapTo } from "./index";

describe("blocking arithmetic", () => {
  it("B always finds somewhere: a fitting gap, else the widest gap shrunk, else after the day", () => {
    const free = [
      { start: 540, end: 600 },
      { start: 630, end: 720 },
    ];
    expect(chooseSlot(free, 550, 45, 1080)).toEqual({ start: 550, end: 595 });
    // Nothing holds two hours: the widest remaining gap, trimmed to what is left of it.
    expect(chooseSlot(free, 550, 120, 1080)).toEqual({ start: 630, end: 720 });
    expect(chooseSlot(free, 650, 120, 1080)).toEqual({ start: 650, end: 720 });
    // The day is spent: straight after working hours, at the asked time if that is later.
    expect(chooseSlot(free, 1000, 60, 1080)).toEqual({ start: 1080, end: 1140 });
    expect(chooseSlot([], 1100, 60, 1080)).toEqual({ start: 1100, end: 1160 });
    expect(chooseSlot([], 1420, 60, 1080)).toEqual({ start: 1420, end: 1440 });
  });
  it("snaps to five minutes by default and to fifteen for ad-hoc drags", () => {
    expect(snapTo(553)).toBe(555);
    expect(snapTo(552)).toBe(550);
    expect(snapTo(553, 15)).toBe(555);
    expect(snapTo(560, 15)).toBe(555);
  });

  it("a block is the estimate snapped, the default for a guess, and never under five minutes", () => {
    expect(blockLength(47, 30)).toBe(45);
    expect(blockLength(null, 30)).toBe(30);
    expect(blockLength(2, 30)).toBe(5);
  });

  it("finds the first gap that fits, starting no earlier than asked", () => {
    const free = [
      { start: 540, end: 600 }, // 09:00–10:00
      { start: 630, end: 720 }, // 10:30–12:00
      { start: 780, end: 1080 },
    ];
    expect(nextFreeGap(free, 540, 45)).toEqual({ start: 540, end: 585 });
    expect(nextFreeGap(free, 570, 45)).toEqual({ start: 630, end: 675 });
    expect(nextFreeGap(free, 700, 90)).toEqual({ start: 780, end: 870 });
    expect(nextFreeGap(free, 1000, 120)).toBeNull();
    expect(nextFreeGap([], 540, 30)).toBeNull();
  });

  it("maps a pointer offset to a snapped minute of the day", () => {
    expect(minuteAtOffset(0, 1.1, 540)).toBe(540);
    expect(minuteAtOffset(66, 1.1, 540)).toBe(600);
    expect(minuteAtOffset(70, 1.1, 540)).toBe(605);
    expect(minuteAtOffset(-9999, 1.1, 540)).toBe(0);
  });

  it("places and resizes inside the day", () => {
    expect(placeAt(603, 45)).toEqual({ start: 605, end: 650 });
    expect(placeAt(1430, 60)).toEqual({ start: 1430, end: 1440 });
    expect(resizeEnd({ start: 600, end: 645 }, 662)).toEqual({ start: 600, end: 660 });
    expect(resizeEnd({ start: 600, end: 645 }, 590)).toEqual({ start: 600, end: 605 });
    expect(resizeEnd({ start: 1400, end: 1430 }, 2000)).toEqual({ start: 1400, end: 1440 });
  });

  it("knows when two intervals overlap", () => {
    expect(overlaps({ start: 600, end: 660 }, { start: 630, end: 700 })).toBe(true);
    expect(overlaps({ start: 600, end: 660 }, { start: 660, end: 700 })).toBe(false);
  });
});
