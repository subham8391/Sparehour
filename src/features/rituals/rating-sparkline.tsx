// The shutdown's 14-day rating line (SCREENS.md §15 step 3): fourteen slots, today last, a dot for each rated day
// and a line only between days that sit side by side, so an unrated day is a gap rather than a guess. Ink tones
// only — a rating is not spare time and not a deadline, so never green or red. The summary carries the meaning
// for a screen reader; the drawing is decoration.
import { cx } from "@/ui/cx";
import type { RatingTrend } from "./rating-trend";

const W = 280;
const H = 56;
const PAD = 6;

export function RatingSparkline({ trend, className }: { trend: RatingTrend; className?: string }) {
  const step = (W - PAD * 2) / (trend.days.length - 1);
  const x = (i: number) => PAD + i * step;
  const y = (rating: number) => PAD + ((5 - rating) / 4) * (H - PAD * 2);
  const segments: string[] = [];
  trend.days.forEach((d, i) => {
    const prev = trend.days[i - 1];
    if (i > 0 && d.rating != null && prev?.rating != null) segments.push(`M${x(i - 1)} ${y(prev.rating)}L${x(i)} ${y(d.rating)}`);
  });
  const last = trend.days.length - 1;
  return (
    <figure className={cx("flex flex-col gap-1.5", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xs" aria-hidden="true">
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} className="stroke-line" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {segments.length > 0 && <path d={segments.join("")} fill="none" className="stroke-ink-3" strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {trend.days.map((d, i) =>
          d.rating == null ? null : <circle key={d.date} cx={x(i)} cy={y(d.rating)} r={i === last ? 3.5 : 2.5} className={i === last ? "fill-ink" : "fill-ink-2"} />,
        )}
      </svg>
      <figcaption className="text-body-sm text-ink-3">{trend.summary}</figcaption>
    </figure>
  );
}
