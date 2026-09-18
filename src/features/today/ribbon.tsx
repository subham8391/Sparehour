"use client";
// The spare-time ribbon (DESIGN_SYSTEM.md §5): the hero number, then the day
// drawn as an instrument. The spare track carries a dot grid, the elapsed part
// of the day a hatch, meetings sit in meet-fill and blocks in block-fill, a
// 2 px ink cursor marks now and a dashed spare cursor the projected finish,
// and engraved ticks with hour labels sit beneath. A cursor's time takes the
// place of the hour labels it would collide with. Nothing here moves on load.
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Capacity } from "@/core/capacity";
import { formatMinutes, formatTime, timeFromMinutes } from "@/core/time";
import { cx } from "@/ui/cx";

/** Hour labels this close to a cursor's time yield to it: 35 min is 49 px on a 760 px track, 32 px on a phone's. */
const YIELD_MIN = 35;
/** Below 340 px of track only every second hour is labelled and a cursor clears a wider berth. */
const YIELD_NARROW_MIN = 60;

export interface RibbonProps {
  c: Capacity;
  /** The current minute of the day when the ribbon is today's: draws the elapsed hatch and the now cursor. */
  nowMin?: number;
  compact?: boolean;
  /** `connected` false is the no-calendar variant (PRODUCT_SPEC.md §9.4): the meetings line becomes the way to get one. */
  connected?: boolean;
}

export interface RibbonLabel {
  min: number;
  text: string;
  kind: "hour" | "now" | "finish";
  /** `narrow` hides the label on a track under 340 px; `always` hides it because a cursor's time sits there. */
  hide: "never" | "narrow" | "always";
}

/**
 * The labels under the ticks: every whole hour, the now time and the finish
 * time. Hour labels within YIELD_MIN of a cursor yield to it; on a narrow
 * track the odd hours go too, and the berth widens to YIELD_NARROW_MIN. When
 * the finish sits inside the now label's berth the now label wins, as the
 * finish is already named in the card's prose.
 */
export function ribbonLabels(day: number, end: number, nowMin?: number, finishMin?: number): RibbonLabel[] {
  const within = (m: number | undefined): m is number => m !== undefined && m >= day && m <= end;
  const now = within(nowMin) ? nowMin : undefined;
  const finishShown = within(finishMin) && (now === undefined || Math.abs(finishMin - now) >= YIELD_MIN);
  const finish = finishShown ? finishMin : undefined;
  const cursors = [now, finish].filter((m): m is number => m !== undefined);
  const near = (h: number, berth: number) => cursors.some((m) => Math.abs(h - m) < berth);
  const labels: RibbonLabel[] = [];
  const firstHour = Math.ceil(day / 60) * 60;
  for (let h = firstHour, i = 0; h <= end; h += 60, i++) {
    const hide = near(h, YIELD_MIN) ? "always" : i % 2 === 1 || near(h, YIELD_NARROW_MIN) ? "narrow" : "never";
    labels.push({ min: h, text: formatTime(timeFromMinutes(h)).slice(0, 2), kind: "hour", hide });
  }
  if (now !== undefined) labels.push({ min: now, text: formatTime(timeFromMinutes(now)), kind: "now", hide: "never" });
  if (finish !== undefined) labels.push({ min: finish, text: formatTime(timeFromMinutes(finish)), kind: "finish", hide: now !== undefined && Math.abs(finish - now) < YIELD_NARROW_MIN ? "narrow" : "never" });
  return labels;
}

export function Ribbon({ c, nowMin, compact = false, connected = true }: RibbonProps) {
  if (c.state === "no_work_day") return <p className="text-ink-2">Not a working day.</p>;
  const day = c.windows[0].start;
  const end = c.windows[c.windows.length - 1].end;
  const span = end - day;
  const pct = (m: number) => ((m - day) / span) * 100;
  const w = (a: number, b: number) => `${((b - a) / span) * 100}%`;
  const over = c.spareMin < 0;
  const finishMin = c.projectedFinish ? c.projectedFinish.hour * 60 + c.projectedFinish.minute : undefined;
  const now = nowMin !== undefined && nowMin >= day && nowMin <= end ? nowMin : undefined;
  const elapsed = nowMin === undefined ? 0 : Math.min(Math.max(nowMin - day, 0), span);
  // The over-tail is proportional to the overflow, but never so wide that the day itself shrinks to nothing.
  const tail = c.overflowMin > 0 ? Math.min(Math.max((c.overflowMin / span) * 100, 6), 20) : 0;
  // Whole hours only under the ticks: a half-hour start keeps the tile aligned to the clock, not to the window's edge.
  const firstHour = Math.ceil(day / 60) * 60;
  const lastHour = Math.floor(end / 60) * 60;
  const labels = ribbonLabels(day, end, nowMin, finishMin);
  // The first label sits flush left and the last flush right, so nothing pokes out of the card.
  const align = (p: number) => (p < 4 ? "" : p > 96 ? "-translate-x-full" : "-translate-x-1/2");

  return (
    <section aria-label="Spare time today" className={cx("rounded-xl border border-line bg-surface", compact ? "p-4" : "px-4 py-4 sm:px-7 sm:py-5.5")}>
      {/* The contributors sit on the number's baseline; a column too narrow for both drops them, whole, to a line of their own. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-6 sm:gap-y-2">
        <p className="flex items-baseline gap-2.5 whitespace-nowrap sm:gap-3.5">
          <span className={cx("font-display font-book num text-ink", compact ? "text-title" : "text-hero", c.spareMin === 0 && "text-ink-2")}>{formatMinutes(over ? -c.spareMin : c.spareMin)}</span>
          <span className={cx("font-display-italic", compact ? "text-pane" : "text-em", over ? "text-over" : "text-spare")}>{over ? "over" : "spare"}</span>
        </p>
        <p className="min-w-0 text-label text-ink-2 num sm:ml-auto sm:text-right sm:text-body-sm sm:whitespace-nowrap">
          <b className="font-medium text-ink">{formatMinutes(c.committedMin + c.unscheduledMin)}</b> planned
          <span className="text-ink-4"> · </span>
          {connected ? (
            <>
              <b className="font-medium text-ink">{formatMinutes(c.busyMin)}</b> in meetings
            </>
          ) : (
            <Link href="/settings#calendar" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
              connect a calendar to see real free time
            </Link>
          )}
          {c.projectedFinish && (
            <>
              <span className="text-ink-4"> · </span>
              <span className="font-semibold text-spare">done by {formatTime(c.projectedFinish)}</span>
            </>
          )}
          {c.overflowMin > 0 && (
            <>
              <span className="text-ink-4"> · </span>
              <span className="font-semibold text-over">~{formatMinutes(c.overflowMin)} spills over</span>
            </>
          )}
        </p>
      </div>

      {/* The instrument. Everything it says is in the prose above, so assistive tech skips the drawing. */}
      <div aria-hidden="true" className={cx("@container relative", compact ? "mt-3" : "mt-3.5 sm:mt-5")}>
        <div className="relative" style={tail ? { width: `${100 - tail}%` } : undefined}>
          <div className="relative h-4 rounded-xs ribbon-track sm:h-6">
            <div className="absolute inset-0 overflow-hidden rounded-xs">
              {c.busy.map((b, i) => (
                <span key={`m${i}`} className="absolute inset-y-0 rounded-[3px] bg-meet-fill" style={{ left: `${pct(b.start)}%`, width: w(b.start, b.end) }} />
              ))}
              {c.blocks.map((b, i) => (
                <span key={`b${i}`} className="absolute inset-y-0 rounded-[3px] bg-block-fill" style={{ left: `${pct(b.start)}%`, width: w(b.start, b.end) }} />
              ))}
              {elapsed > 0 && <span className="absolute inset-y-0 left-0 ribbon-elapsed" style={{ width: `${(elapsed / span) * 100}%` }} />}
            </div>
            {finishMin !== undefined && finishMin >= day && finishMin <= end && (
              <span className="absolute inset-y-0 z-[1] w-0 border-l-[1.5px] border-dashed border-spare-fill" style={{ left: `${pct(finishMin)}%` }} />
            )}
            {now !== undefined && (
              <span className="absolute -top-1 -bottom-1 z-[2] w-0.5 -translate-x-px rounded-[1px] bg-ink shadow-[0_0_0_1px_var(--surface)]" style={{ left: `${pct(now)}%` }} />
            )}
          </div>
          {lastHour > firstHour && (
            <div className="relative mt-0.5 h-2">
              <span
                className="absolute inset-y-0 ribbon-ticks"
                style={{ left: `${pct(firstHour)}%`, width: `${((lastHour - firstHour) / span) * 100}%`, "--ribbon-hours": (lastHour - firstHour) / 60 } as CSSProperties}
              />
            </div>
          )}
          <div className="relative mt-0.5 h-3.5 text-micro font-medium text-ink-3 num">
            {labels.map((l) => (
              <span
                key={`${l.kind}${l.min}`}
                className={cx(
                  "absolute top-0 whitespace-nowrap",
                  align(pct(l.min)),
                  l.kind === "now" && "font-semibold text-ink",
                  l.kind === "finish" && "font-semibold text-spare",
                  l.hide === "always" && "hidden",
                  l.hide === "narrow" && "hidden @min-[340px]:block",
                )}
                style={{ left: `${pct(l.min)}%` }}
              >
                {l.text}
              </span>
            ))}
          </div>
        </div>
        {tail > 0 && <span className="absolute top-0 right-0 h-4 rounded-r-xs border border-l-0 border-over-line ribbon-over sm:h-6" style={{ width: `${tail}%` }} />}
      </div>
    </section>
  );
}
