// The day rating over time (PRODUCT_SPEC.md §12.2 step 3; SCREENS.md §15 "A 14-day sparkline appears once 5
// ratings exist"): the last fourteen days, today last, each with its rating or a gap. Pure.
import type { LocalDate } from "@/core/time";

export const TREND_DAYS = 14;
/** Fewer rated days than this and there is no trend to show, so no chart at all. */
export const TREND_MIN_RATINGS = 5;

export interface TrendDay {
  date: string;
  rating: number | null;
}

export interface RatingTrend {
  days: TrendDay[];
  rated: number;
  /** The words a screen reader gets in place of the line. */
  summary: string;
}

const isRating = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;

/** The trend, or null while fewer than five of the last fourteen days have a rating. */
export function ratingTrend(today: LocalDate, rows: readonly { date: string; day_rating: number | null }[]): RatingTrend | null {
  const byDate = new Map<string, number>();
  for (const r of rows) if (isRating(r.day_rating)) byDate.set(String(r.date).slice(0, 10), r.day_rating);
  const days: TrendDay[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const date = today.subtract({ days: i }).toString();
    days.push({ date, rating: byDate.get(date) ?? null });
  }
  const ratings = days.flatMap((d) => (d.rating == null ? [] : [d.rating]));
  if (ratings.length < TREND_MIN_RATINGS) return null;
  const average = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const low = Math.min(...ratings);
  const high = Math.max(...ratings);
  const spread = low === high ? `all ${low}` : `from ${low} to ${high}`;
  return { days, rated: ratings.length, summary: `${ratings.length} of the last ${TREND_DAYS} days rated, ${spread}, averaging ${average.toFixed(1)}.` };
}
