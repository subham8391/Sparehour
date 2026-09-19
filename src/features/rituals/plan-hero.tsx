"use client";
// The morning plan's frame (SCREENS.md §14, brief P5): the one spare number,
// the same figure Today shows, over the working day drawn by the very same
// `RibbonTrack` the Today hero uses, and one line of prose where the stat
// tiles were. Nothing here is a decision.
import type { Capacity } from "@/core/capacity";
import { formatMinutes, type Instant } from "@/core/time";
import { heroState, RibbonTrack } from "@/features/today/ribbon";
import { cx } from "@/ui/cx";
import { frameLine } from "./morning-plan";

export function PlanHero({ c, now, zone, carried }: { c: Capacity | null; now: Instant; zone: string; carried: number }) {
  if (!c || c.state === "no_work_day") return <p className="text-body-lg text-pretty text-ink-2">{frameLine(c, carried)}</p>;
  const z = now.toZonedDateTimeISO(zone);
  const nowMin = z.hour * 60 + z.minute;
  const h = heroState(c);
  return (
    <section aria-label="Your day" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <p className="flex items-baseline gap-2.5 whitespace-nowrap sm:gap-3.5">
          <span className="font-display text-hero font-book text-ink num">{formatMinutes(h.min)}</span>
          <span className={cx("font-display-italic text-em", h.over ? "text-over" : "text-spare")}>{h.over ? "over" : "spare"}</span>
        </p>
        {/* One state, like Today's: the day finishes, or it spills (ruling R3). */}
        {(h.finish || h.spill) && <p className={cx("text-body-sm font-semibold num sm:text-right", h.spill ? "text-over" : "text-spare")}>{h.spill ?? h.finish}</p>}
      </div>

      <RibbonTrack c={c} nowMin={nowMin} className="mt-4 sm:mt-5" />

      <p className="mt-4 text-body-lg text-pretty text-ink-2 sm:mt-5">{frameLine(c, carried)}</p>
    </section>
  );
}
