import { describe, expect, it, vi } from "vitest";
import {
  bufferPreview,
  hoursSummary,
  longestDayMinutes,
  mergeSegments,
  nextSegment,
  rolloverLabel,
  segmentError,
  segmentMinutes,
  segmentsError,
  segmentsOverlap,
  timeZoneHint,
  timeZoneOptions,
} from "./settings-rules";

describe("work-hours segments", () => {
  it("measures a valid segment and rejects a backwards or malformed one", () => {
    expect(segmentMinutes({ start: "09:00", end: "18:00" })).toBe(540);
    expect(segmentMinutes({ start: "18:00", end: "09:00" })).toBeNull();
    expect(segmentMinutes({ start: "9am", end: "18:00" })).toBeNull();
    expect(segmentError({ start: "09:00", end: "09:00" })).toBe("The day has to end after it starts.");
    expect(segmentError({ start: "09:00", end: "" })).toBe("Use a time like 09:00.");
    expect(segmentError({ start: "09:00", end: "17:30" })).toBeNull();
  });

  it("takes the longest day for the preview, its stretches summed, and assumes nine hours when there is none", () => {
    expect(longestDayMinutes([[{ start: "09:00", end: "18:00" }], [], [{ start: "10:00", end: "14:00" }]])).toBe(540);
    expect(longestDayMinutes([[], []])).toBe(540);
    expect(longestDayMinutes([[{ start: "08:00", end: "12:00" }]])).toBe(240);
    expect(
      longestDayMinutes([
        [
          { start: "09:00", end: "12:30" },
          { start: "13:30", end: "18:00" },
        ],
      ]),
    ).toBe(480);
    // Overlaps count once.
    expect(
      longestDayMinutes([
        [
          { start: "09:00", end: "13:00" },
          { start: "12:00", end: "14:00" },
        ],
      ]),
    ).toBe(300);
  });

  it("checks every stretch, spots overlaps and joins them", () => {
    expect(segmentsError([{ start: "09:00", end: "12:00" }, { start: "13:00", end: "12:30" }])).toBe("The day has to end after it starts.");
    expect(segmentsError([{ start: "09:00", end: "12:00" }, { start: "13:00", end: "18:00" }])).toBeNull();
    expect(segmentsOverlap([{ start: "13:00", end: "18:00" }, { start: "09:00", end: "13:00" }])).toBe(true);
    expect(segmentsOverlap([{ start: "09:00", end: "12:00" }, { start: "13:00", end: "18:00" }])).toBe(false);
    expect(mergeSegments([{ start: "13:00", end: "18:00" }, { start: "09:00", end: "13:30" }, { start: "19:00", end: "20:00" }])).toEqual([
      { start: "09:00", end: "18:00" },
      { start: "19:00", end: "20:00" },
    ]);
    expect(mergeSegments([{ start: "09:00", end: "18:00" }, { start: "10:00", end: "11:00" }])).toEqual([{ start: "09:00", end: "18:00" }]);
  });

  it("offers the next stretch an hour after the last, before the first when the evening is full, and at most three", () => {
    expect(nextSegment([])).toEqual({ start: "09:00", end: "18:00" });
    expect(nextSegment([{ start: "09:00", end: "12:30" }])).toEqual({ start: "13:30", end: "14:30" });
    expect(nextSegment([{ start: "09:00", end: "22:30" }])).toEqual({ start: "07:00", end: "08:00" });
    expect(nextSegment([{ start: "00:30", end: "23:00" }])).toBeNull();
    expect(nextSegment([{ start: "07:00", end: "08:00" }, { start: "09:00", end: "12:00" }, { start: "13:00", end: "17:00" }])).toBeNull();
  });

  it("summarises the week in one line", () => {
    const nine = [{ start: "09:00", end: "18:00" }];
    expect(hoursSummary([nine, nine, nine, nine, nine, [], []])).toBe("Mon–Fri · 09:00–18:00");
    expect(hoursSummary([nine, [], nine, [], nine, [], []])).toBe("Mon, Wed, Fri · 09:00–18:00");
    expect(hoursSummary([nine, nine, [{ start: "09:00", end: "12:30" }, { start: "13:30", end: "18:00" }], [], [], [], []])).toBe("Mon–Wed · hours vary");
    expect(hoursSummary([[{ start: "09:00", end: "12:30" }, { start: "13:30", end: "18:00" }], [], [], [], [], [], []])).toBe("Mon · 09:00–12:30, 13:30–18:00");
    expect(hoursSummary([[], [], [], [], [], [], []])).toBe("No working days");
  });
});

describe("bufferPreview", () => {
  it("says what the percentage costs on the day, to five minutes", () => {
    expect(bufferPreview(15, 540)).toBe("15% · 1h 20m held back on a 9h day");
    expect(bufferPreview(0, 540)).toBe("0% · 0m held back on a 9h day");
    expect(bufferPreview(20, 480)).toBe("20% · 1h 35m held back on a 8h day");
  });
});

describe("rollover and time zones", () => {
  it("labels the rollover hour and offers the saved zone even when the list lacks it", () => {
    expect(rolloverLabel(0)).toBe("Midnight");
    expect(rolloverLabel(4)).toBe("04:00");
    expect(timeZoneOptions("Europe/London")).toContain("Europe/London");
    expect(timeZoneOptions("Mars/Olympus")[0]).toBe("Mars/Olympus");
  });

  it("hints at the detected zone only when it differs", () => {
    expect(timeZoneHint("Europe/London", "Asia/Kolkata")).toBe("Detected Asia/Kolkata");
    expect(timeZoneHint("Europe/London", "Europe/London")).toBeNull();
    // Chrome in India reports the old name of the same zone: no hint (seen in the walkthrough).
    expect(timeZoneHint("Asia/Kolkata", "Asia/Calcutta")).toBeNull();
    expect(timeZoneHint("Europe/Kyiv", "Europe/Kiev")).toBeNull();
    expect(timeZoneHint("Asia/Kolkata", "Asia/Dhaka")).toBe("Detected Asia/Dhaka");
  });

  it("lists zones by their current names, always with UTC, so Asia/Kolkata can be picked again (Chromium lists Asia/Calcutta)", () => {
    const spy = vi.spyOn(Intl, "supportedValuesOf").mockReturnValue(["America/New_York", "Asia/Calcutta", "Europe/Kiev", "Europe/London"]);
    try {
      const zones = timeZoneOptions("Europe/London");
      expect(zones).toContain("Asia/Kolkata");
      expect(zones).toContain("Europe/Kyiv");
      expect(zones).toContain("UTC");
      expect(zones).not.toContain("Asia/Calcutta");
    } finally {
      spy.mockRestore();
    }
    expect(timeZoneHint("Europe/London", null)).toBeNull();
  });
});
