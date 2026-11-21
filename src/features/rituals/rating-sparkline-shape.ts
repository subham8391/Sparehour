// Where the shutdown's 14-day rating line puts its marks (SCREENS.md §15 step 3): fourteen slots across, today last,
// a dot for each rated day and a line only between days that sit side by side, so an unrated day is a gap rather
// than a guess. Pure numbers on a 280 × 56 drawing, so the web's SVG (rating-sparkline.tsx) and the Android app's
// draw the same line (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import type { RatingTrend } from "./rating-trend";

export const SPARK_WIDTH = 280;
export const SPARK_HEIGHT = 56;
const PAD = 6;

export interface SparklineShape {
  width: number;
  height: number;
  /** The rule the days stand on. */
  base: { x1: number; x2: number; y: number };
  /** The line between neighbouring rated days, as one SVG path; empty when no two rated days are neighbours. */
  path: string;
  /** One per rated day; the last slot is today, drawn a little larger. */
  dots: { date: string; cx: number; cy: number; r: number; today: boolean }[];
}

export function sparklineShape(trend: RatingTrend): SparklineShape {
  const step = (SPARK_WIDTH - PAD * 2) / (trend.days.length - 1);
  const x = (i: number) => PAD + i * step;
  const y = (rating: number) => PAD + ((5 - rating) / 4) * (SPARK_HEIGHT - PAD * 2);
  const segments: string[] = [];
  trend.days.forEach((d, i) => {
    const prev = trend.days[i - 1];
    if (i > 0 && d.rating != null && prev?.rating != null) segments.push(`M${x(i - 1)} ${y(prev.rating)}L${x(i)} ${y(d.rating)}`);
  });
  const last = trend.days.length - 1;
  return {
    width: SPARK_WIDTH,
    height: SPARK_HEIGHT,
    base: { x1: PAD, x2: SPARK_WIDTH - PAD, y: SPARK_HEIGHT - PAD },
    path: segments.join(""),
    dots: trend.days.flatMap((d, i) => (d.rating == null ? [] : [{ date: d.date, cx: x(i), cy: y(d.rating), r: i === last ? 3.5 : 2.5, today: i === last }])),
  };
}
