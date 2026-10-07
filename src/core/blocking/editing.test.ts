import { describe, expect, it } from "vitest";
import { coveredMinutes, drawnBlock, estimateMismatch, minuteAtOffset, pxPerMinute, resizeStart, stepZoom } from "./index";

describe("block editing arithmetic", () => {
  it("resizes from the top edge: the end stays, five minutes at least, never before midnight", () => {
    expect(resizeStart({ start: 600, end: 660 }, 583)).toEqual({ start: 585, end: 660 });
    expect(resizeStart({ start: 600, end: 660 }, 700)).toEqual({ start: 655, end: 660 });
    expect(resizeStart({ start: 20, end: 60 }, -40)).toEqual({ start: 0, end: 60 });
  });

  it("draws an ad-hoc block snapped out to fifteen minutes, either direction, never shorter than fifteen", () => {
    expect(drawnBlock(602, 641)).toEqual({ start: 600, end: 645 });
    expect(drawnBlock(641, 602)).toEqual({ start: 600, end: 645 });
    expect(drawnBlock(603, 606)).toEqual({ start: 600, end: 615 });
    expect(drawnBlock(1435, 1500)).toEqual({ start: 1425, end: 1440 });
    expect(drawnBlock(-20, 10)).toEqual({ start: 0, end: 15 });
  });

  it("zooms between 30, 15 and 5 minute rows of the same height, 66 px an hour by default", () => {
    expect(pxPerMinute(30) * 60).toBeCloseTo(66);
    expect(pxPerMinute(15) * 15).toBeCloseTo(33);
    expect(pxPerMinute(5) * 5).toBeCloseTo(33);
    expect(stepZoom(30, 1)).toBe(15);
    expect(stepZoom(15, 1)).toBe(5);
    expect(stepZoom(5, 1)).toBe(5);
    expect(stepZoom(5, -1)).toBe(15);
    expect(stepZoom(30, -1)).toBe(30);
  });

  it("lands a pointer on the same minute at every zoom", () => {
    for (const step of [30, 15, 5] as const) {
      const scale = pxPerMinute(step);
      // 10:35 on a timeline drawn from midnight, pointer exactly on it.
      expect(minuteAtOffset(635 * scale, scale, 0)).toBe(635);
      // From 07:00, a pointer 95 minutes down.
      expect(minuteAtOffset(95 * scale, scale, 420)).toBe(515);
    }
  });

  it("counts overlapping blocks once", () => {
    expect(coveredMinutes([])).toBe(0);
    expect(
      coveredMinutes([
        { start: 600, end: 660 },
        { start: 630, end: 690 },
        { start: 720, end: 750 },
      ]),
    ).toBe(120);
    expect(
      coveredMinutes([
        { start: 600, end: 700 },
        { start: 610, end: 620 },
      ]),
    ).toBe(100);
  });

  it("names a mismatch with the estimate as a quiet hint, and nothing when they match or there is no estimate", () => {
    expect(estimateMismatch(75, 120)).toEqual({ kind: "short", min: 45 });
    expect(estimateMismatch(90, 60)).toEqual({ kind: "over", min: 30 });
    expect(estimateMismatch(60, 60)).toBeNull();
    expect(estimateMismatch(60, null)).toBeNull();
    expect(estimateMismatch(0, 60)).toBeNull();
  });
});
