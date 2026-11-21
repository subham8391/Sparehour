import { describe, expect, it } from "vitest";
import { localDate } from "@/core/time";
import { sparklineShape } from "./rating-sparkline-shape";
import { ratingTrend, type RatingTrend } from "./rating-trend";

const today = localDate("2026-11-21");
const trendOf = (ratings: Record<number, number>): RatingTrend => {
  const trend = ratingTrend(today, Object.entries(ratings).map(([daysAgo, day_rating]) => ({ date: today.subtract({ days: Number(daysAgo) }).toString(), day_rating })));
  if (!trend) throw new Error("fewer than five ratings");
  return trend;
};

describe("sparklineShape", () => {
  it("draws on 280 × 56 with the rule the days stand on", () => {
    const shape = sparklineShape(trendOf({ 0: 5, 1: 4, 2: 3, 3: 2, 4: 1 }));
    expect([shape.width, shape.height]).toEqual([280, 56]);
    expect(shape.base).toEqual({ x1: 6, x2: 274, y: 50 });
  });

  it("puts a dot on each rated day, today last at the far edge and a little larger, a 5 at the top and a 1 on the rule", () => {
    const shape = sparklineShape(trendOf({ 0: 5, 1: 4, 2: 3, 3: 2, 13: 1 }));
    expect(shape.dots).toHaveLength(5);
    const first = shape.dots[0];
    const last = shape.dots[shape.dots.length - 1];
    expect(first).toEqual({ date: "2026-11-08", cx: 6, cy: 50, r: 2.5, today: false });
    expect(last).toEqual({ date: "2026-11-21", cx: 274, cy: 6, r: 3.5, today: true });
  });

  it("joins only days that sit side by side, so an unrated day is a gap", () => {
    // Rated: today, yesterday, then a gap, then three in a row.
    const shape = sparklineShape(trendOf({ 0: 3, 1: 3, 3: 3, 4: 3, 5: 3 }));
    expect(shape.path.match(/M/g)).toHaveLength(3);
    const apart = sparklineShape(trendOf({ 0: 3, 2: 3, 4: 3, 6: 3, 8: 3 }));
    expect(apart.path).toBe("");
    expect(apart.dots).toHaveLength(5);
  });
});
