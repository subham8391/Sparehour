import { describe, expect, it } from "vitest";
import { bufferPreview, longestDayMinutes, rolloverLabel, segmentError, segmentMinutes, timeZoneHint, timeZoneOptions } from "./settings-rules";

describe("work-hours segments", () => {
  it("measures a valid segment and rejects a backwards or malformed one", () => {
    expect(segmentMinutes({ start: "09:00", end: "18:00" })).toBe(540);
    expect(segmentMinutes({ start: "18:00", end: "09:00" })).toBeNull();
    expect(segmentMinutes({ start: "9am", end: "18:00" })).toBeNull();
    expect(segmentError({ start: "09:00", end: "09:00" })).toBe("The day has to end after it starts.");
    expect(segmentError({ start: "09:00", end: "" })).toBe("Use a time like 09:00.");
    expect(segmentError({ start: "09:00", end: "17:30" })).toBeNull();
  });

  it("takes the longest day for the preview and assumes nine hours when there is none", () => {
    expect(longestDayMinutes([{ start: "09:00", end: "18:00" }, null, { start: "10:00", end: "14:00" }])).toBe(540);
    expect(longestDayMinutes([null, null])).toBe(540);
    expect(longestDayMinutes([{ start: "08:00", end: "12:00" }])).toBe(240);
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
    expect(timeZoneHint("Europe/London", null)).toBeNull();
  });
});
