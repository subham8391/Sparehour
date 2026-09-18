"use client";
// The morning plan's frame (SCREENS.md §14, brief P5): the one spare number,
// the same figure Today shows, over the working day drawn with the ribbon
// utilities (the dot-grid track, the hatch over the hours already gone, the
// now mark, the dashed finish mark, the ticks), and one line of prose where
// the stat tiles were. Nothing here is a decision.
import type { CSSProperties } from "react";
import type { Capacity } from "@/core/capacity";
import { formatMinutes, formatTime, timeFromMinutes, type Instant } from "@/core/time";
import { cx } from "@/ui/cx";
import { frameLine } from "./morning-plan";

/** An hour label this close to the now mark (as a share of the day) yields to the time under it. */
const YIELD = 0.06;

export function PlanHero({ c, now, zone, carried }: { c: Capacity | null; now: Instant; zone: string; carried: number }) {
  if (!c || c.state === "no_work_day") return <p className="text-body-lg text-pretty text-ink-2">{frameLine(c, carried)}</p>;
  const start = c.windows[0].start;
  const end = c.windows[c.windows.length - 1].end;
  const span = end - start;
  const pct = (m: number) => `${((m - start) / span) * 100}%`;
  const width = (a: number, b: number) => `${((b - a) / span) * 100}%`;
  const z = now.toZonedDateTimeISO(zone);
  const nowMin = z.hour * 60 + z.minute;
  const onDay = nowMin >= start && nowMin <= end;
  const elapsedTo = Math.min(Math.max(nowMin, start), end);
  const finishMin = c.projectedFinish ? c.projectedFinish.hour * 60 + c.projectedFinish.minute : null;
  const hours = Array.from({ length: Math.floor(span / 60) + 1 }, (_, i) => start + i * 60);
  const last = hours.length - 1;
  const over = c.spareMin < 0;
  return (
    <section aria-label="Your day" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <p className="flex items-baseline gap-2.5 whitespace-nowrap sm:gap-3.5">
          <span className="font-display text-hero font-book text-ink num">{formatMinutes(Math.abs(c.spareMin))}</span>
          <span className={cx("font-display-italic text-em", over ? "text-over" : "text-spare")}>{over ? "over" : "spare"}</span>
        </p>
        {(c.projectedFinish || c.overflowMin > 0) && (
          <p className="text-body-sm font-semibold num sm:text-right">
            {c.projectedFinish && <span className="text-spare">done by {formatTime(c.projectedFinish)}</span>}
            {c.projectedFinish && c.overflowMin > 0 && <span className="text-ink-4"> · </span>}
            {c.overflowMin > 0 && <span className="text-over">~{formatMinutes(c.overflowMin)} spills over</span>}
          </p>
        )}
      </div>

      <div className="mt-4 sm:mt-5" style={{ "--ribbon-hours": last } as CSSProperties}>
        <div className="relative">
          <div className="ribbon-track relative h-4 overflow-hidden rounded-xs sm:h-6">
            {c.busy.map((b, i) => (
              <span key={`m${i}`} className="absolute inset-y-0 rounded-[3px] bg-meet-fill" style={{ left: pct(b.start), width: width(b.start, b.end) }} />
            ))}
            {c.blocks.map((b, i) => (
              <span key={`b${i}`} className="absolute inset-y-0 rounded-[3px] bg-block-fill" style={{ left: pct(b.start), width: width(b.start, b.end) }} />
            ))}
            {elapsedTo > start && <span aria-hidden="true" className="ribbon-elapsed absolute inset-y-0 left-0" style={{ width: pct(elapsedTo) }} />}
          </div>
          {finishMin !== null && finishMin >= start && finishMin <= end && <span aria-hidden="true" className="absolute -inset-y-0.5 border-l-[1.5px] border-dashed border-spare-fill" style={{ left: pct(finishMin) }} />}
          {onDay && <span aria-hidden="true" className="absolute -inset-y-1 w-0.5 -translate-x-px rounded-full bg-ink ring-1 ring-surface" style={{ left: pct(nowMin) }} />}
        </div>
        <div aria-hidden="true" className="ribbon-ticks mt-1.5 h-2" />
        <div className="relative mt-0.5 h-3.5 text-micro font-medium text-ink-3 num">
          {hours.map((m, i) => (
            <span
              key={m}
              className={cx(
                "absolute -translate-x-1/2",
                i === 0 && "translate-x-0",
                i === last && "-translate-x-full",
                // The phone track is too short for every hour; the last label always stays.
                i % 2 === 1 && i !== last && "max-sm:hidden",
                onDay && Math.abs(m - nowMin) < span * YIELD && "invisible",
              )}
              style={{ left: pct(m) }}
            >
              {formatTime(timeFromMinutes(m)).slice(0, 2)}
            </span>
          ))}
          {onDay && (
            <span className="absolute -translate-x-1/2 font-semibold text-ink" style={{ left: pct(nowMin) }}>
              {formatTime(timeFromMinutes(nowMin))}
            </span>
          )}
        </div>
      </div>

      <p className="mt-4 text-body-lg text-pretty text-ink-2 sm:mt-5">{frameLine(c, carried)}</p>
    </section>
  );
}
