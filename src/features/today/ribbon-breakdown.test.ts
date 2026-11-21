import { describe, expect, it } from "vitest";
import { BREAKDOWN_LABEL, segmentAction } from "./ribbon-breakdown";

// The segments, the line that names one and the equation are checked where the web draws them (ribbon-overlay.test.tsx).
describe("the ribbon's breakdown, in words", () => {
  it("is named once, for the button over the drawing and for its panel", () => {
    expect(BREAKDOWN_LABEL).toBe("Spare time breakdown");
  });

  it("free time takes something new, a meeting is shown on the timeline, and nothing else has an action", () => {
    expect(segmentAction({ kind: "free" })).toBe("Add something");
    expect(segmentAction({ kind: "meeting" })).toBe("Show on timeline");
    expect(segmentAction({ kind: "block" })).toBeNull();
    expect(segmentAction({ kind: "off" })).toBeNull();
    expect(segmentAction({ kind: "over" })).toBeNull();
    expect(segmentAction(null)).toBeNull();
  });
});
