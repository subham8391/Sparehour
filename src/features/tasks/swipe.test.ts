import { describe, expect, it } from "vitest";
import { localDate } from "@/core/time";
import { BUTTON_W, COMPLETE, SLOP, TAP_ONLY, classify, commitAt, release, swipePlan } from "./swipe";

const today = localDate("2026-10-07");

describe("swipePlan", () => {
  const plan = (state: "inbox" | "active" | "someday" | "done" | "dropped" | "archived", doDate: string | null = null) => swipePlan({ state, doDate: doDate ? localDate(doDate) : null }, today);

  it("a Today row completes to the right and moves to Tomorrow · Someday to the left", () => {
    expect(plan("active", "2026-10-07")).toEqual({ right: [COMPLETE], left: ["Tomorrow", "Someday"] });
    // Rows elsewhere that are planned ahead or undated read the same way: right advances, left pushes away.
    expect(plan("active", "2026-10-09")).toEqual({ right: [COMPLETE], left: ["Tomorrow", "Someday"] });
    expect(plan("active")).toEqual({ right: [COMPLETE], left: ["Tomorrow", "Someday"] });
    // Already planned for tomorrow: a left swipe has only Someday to push to.
    expect(plan("active", "2026-10-08")).toEqual({ right: [COMPLETE], left: ["Someday"] });
  });

  it("a carried-over row goes to Today · Tomorrow, or Someday · Drop", () => {
    expect(plan("active", "2026-10-05")).toEqual({ right: ["Today", "Tomorrow"], left: ["Someday", "Drop"] });
  });

  it("Inbox, Someday, the Logbook and Dropped follow their rulings", () => {
    expect(plan("inbox")).toEqual({ right: ["Today"], left: ["Someday"] });
    expect(plan("someday")).toEqual({ right: ["Today"], left: ["Drop"] });
    expect(plan("done")).toEqual({ right: ["Reopen"], left: [] });
    expect(plan("dropped")).toEqual({ right: ["Restore"], left: [] });
    expect(plan("archived")).toEqual({ right: [], left: [] });
  });

  it("Drop only ever runs from a tap", () => {
    expect(TAP_ONLY.has("Drop")).toBe(true);
    expect(TAP_ONLY.has("Someday")).toBe(false);
  });
});

describe("classify", () => {
  it("waits inside the slop, so a tap and a settling long-press are never read as a swipe", () => {
    expect(classify(0, 0)).toBe("pending");
    expect(classify(SLOP - 1, -(SLOP - 1))).toBe("pending");
  });

  it("locks sideways only when the travel is clearly across", () => {
    expect(classify(30, 4)).toBe("x");
    expect(classify(-30, 10)).toBe("x");
    // A diagonal or a scroll is the page's: vertical scrolling is never misread.
    expect(classify(14, 12)).toBe("y");
    expect(classify(3, 40)).toBe("y");
    expect(classify(0, -SLOP)).toBe("y");
  });
});

describe("release", () => {
  const width = 328; // a 360 px phone's row

  it("springs back from a short travel and stays open past the reveal point", () => {
    expect(release(20, width, 2, true)).toBe("close");
    expect(release(-(BUTTON_W * 0.6), width, 2, true)).toBe("open");
    expect(release(-120, width, 2, true)).toBe("open");
  });

  it("runs the first action from a full swipe, over half the row and at least 160 px", () => {
    expect(commitAt(width)).toBeCloseTo(180.4);
    expect(commitAt(200)).toBe(160);
    expect(release(-200, width, 2, true)).toBe("commit");
    expect(release(200, width, 1, true)).toBe("commit");
  });

  it("never commits a tap-only first action, and does nothing on a side with no actions", () => {
    expect(release(-300, width, 1, false)).toBe("open");
    expect(release(300, width, 0, true)).toBe("close");
  });
});
