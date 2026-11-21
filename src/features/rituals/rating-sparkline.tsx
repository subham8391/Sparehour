// The shutdown's 14-day rating line (SCREENS.md §15 step 3): fourteen slots, today last, a dot for each rated day
// and a line only between days that sit side by side, so an unrated day is a gap rather than a guess. Ink tones
// only — a rating is not spare time and not a deadline, so never green or red. The summary carries the meaning
// for a screen reader; the drawing is decoration.
import { cx } from "@/ui/cx";
import { sparklineShape } from "./rating-sparkline-shape";
import type { RatingTrend } from "./rating-trend";

// Where each mark goes is rating-sparkline-shape.ts, shared with the Android app.
export function RatingSparkline({ trend, className }: { trend: RatingTrend; className?: string }) {
  const { width, height, base, path, dots } = sparklineShape(trend);
  return (
    <figure className={cx("flex flex-col gap-1.5", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-xs" aria-hidden="true">
        <line x1={base.x1} x2={base.x2} y1={base.y} y2={base.y} className="stroke-line" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {path && <path d={path} fill="none" className="stroke-ink-3" strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {dots.map((d) => (
          <circle key={d.date} cx={d.cx} cy={d.cy} r={d.r} className={d.today ? "fill-ink" : "fill-ink-2"} />
        ))}
      </svg>
      <figcaption className="text-body-sm text-ink-3">{trend.summary}</figcaption>
    </figure>
  );
}
