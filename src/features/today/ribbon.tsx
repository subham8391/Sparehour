"use client";
// The spare-time ribbon (DESIGN_SYSTEM.md §5): the hero number, then the day
// drawn as an instrument. The spare track carries a dot grid, the elapsed part
// of the day a hatch, meetings sit in meet-fill and blocks in block-fill, a
// 2 px ink cursor marks now and a dashed spare cursor the projected finish,
// and engraved ticks with hour labels sit beneath. A cursor's time takes the
// place of the hour labels it would collide with. Nothing here moves on load.
//
// `RibbonTrack` is the drawing on its own: Today's hero and the morning plan's
// both render it, so there is one ribbon in the product and the two cannot
// drift apart. `heroState` is the matching rule for the words above it.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import type { Capacity } from "@/core/capacity";
import { formatMinutes } from "@/core/time";
import { useRibbonShape } from "@/features/looks/look-shape";
import { cx } from "@/ui/cx";
import { heroState } from "./hero-state";
import type { RibbonOverlayProps } from "./ribbon-overlay";
import { CALENDAR_PATIENCE_MS, TAIL_MAX_PCT, WELL_OVER_MIN, noWorkDayLine, outsideHoursLine, overSentence, ribbonLabels, spokenMinutes } from "./ribbon-words";

// The ribbon's hands — the breakdown, the segment names, a click on free time or a meeting (SCREENS.md §2.2) — are
// not needed for the first paint: an island, fetched when the browser is idle (`preloadRibbonOverlay`).
const loadRibbonOverlay = () => import("./ribbon-overlay");
export const preloadRibbonOverlay = () => loadRibbonOverlay();
const RibbonOverlay = dynamic(loadRibbonOverlay, { ssr: false });

export interface RibbonProps {
  c: Capacity;
  /** The current minute of the day when the ribbon is today's: draws the elapsed hatch and the now cursor. */
  nowMin?: number;
  compact?: boolean;
  /** `connected` false is the no-calendar variant (PRODUCT_SPEC.md §9.4): the meetings line becomes the way to get one. */
  connected?: boolean;
  /** How many things are on the day, for the non-working-day line (SCREENS.md §2.2). */
  plannedCount?: number;
  /** Opens Trim today: the over sentence becomes its button, and a day well over offers it inline (PRODUCT_SPEC.md §9.4). */
  onTrim?: () => void;
  /** The one suggested move when over, a task's title: "— move Write report to tomorrow" (ruling R3, `easiestMove`). */
  suggestion?: string | null;
  /** Today's ribbon answers hover, taps and clicks (SCREENS.md §2.2); left out, the ribbon is only drawn. */
  interactions?: Omit<RibbonOverlayProps, "c" | "connected">;
  /** Something was finished today: a day with nothing left is all done (SCREENS.md §2.7), not "nothing planned yet". */
  finished?: boolean;
  /** Today stepped to a later day (SCREENS.md §2.1): its words drop "today" and it offers no morning plan. */
  otherDay?: boolean;
  /** The calendar is connected but the day's events have not arrived (SCREENS.md §21 Loading). */
  calendarLoading?: boolean;
}

// The hero's state and its rule live in hero-state.ts, free of this file's drawing; they are handed on from here
// so every import of them from the ribbon stays as it was.
export { heroState, type HeroState } from "./hero-state";

// The ribbon's words and its labels live in ribbon-words.ts, free of this file's drawing, for the same reason.
export { CALENDAR_PATIENCE_MS, WELL_OVER_MIN, noWorkDayLine, outsideHoursLine, overSentence, ribbonLabels, spokenMinutes, type RibbonLabel } from "./ribbon-words";

/** Engraved ticks under a horizontal day: whole hours only, so a half-hour start keeps the tile on the clock. */
export function RibbonTicks({ day, end }: { day: number; end: number }) {
  const span = end - day;
  const firstHour = Math.ceil(day / 60) * 60;
  const lastHour = Math.floor(end / 60) * 60;
  if (lastHour <= firstHour) return null;
  return (
    <div className="relative mt-0.5 h-2">
      <span
        className="absolute inset-y-0 ribbon-ticks"
        style={{ left: `${((firstHour - day) / span) * 100}%`, width: `${((lastHour - firstHour) / span) * 100}%`, "--ribbon-hours": (lastHour - firstHour) / 60 } as CSSProperties}
      />
    </div>
  );
}

/** The one label row under a horizontal day: the hours, and the now and finish times in their place (ribbonLabels). */
export function RibbonLabelRow({ day, end, nowMin, finishMin }: { day: number; end: number; nowMin?: number; finishMin?: number }) {
  const span = end - day;
  const pct = (m: number) => ((m - day) / span) * 100;
  // The first label sits flush left and the last flush right, so nothing pokes out of the card.
  const align = (p: number) => (p < 4 ? "" : p > 96 ? "-translate-x-full" : "-translate-x-1/2");
  return (
    <div className="relative mt-0.5 h-3.5 text-micro font-medium text-ink-3 num">
      {ribbonLabels(day, end, nowMin, finishMin).map((l) => (
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
  );
}

// The four looks drawn with another shape (look-shape.ts) get it from an island, fetched only when such a look is on:
// every other look, and the shell's size, keep the standard ribbon. A placeholder holds the bar's height meanwhile.
const loadRibbonShapes = () => import("./ribbon-shapes");
const RibbonShapes = dynamic(loadRibbonShapes, { ssr: false, loading: () => <div aria-hidden="true" className="h-[42px] sm:h-[50px]" /> });

/**
 * The instrument itself: track, segments, elapsed hatch, the two cursors, the
 * engraved ticks, the one label row and the over-tail. Everything it says is
 * in the prose beside it, so assistive tech skips the drawing. A look with its
 * own shape (Pulse's ring, Tide's wave, Sundial's arc, Metro's line) draws the
 * same day that way instead.
 */
export function RibbonTrack({ c, nowMin, className }: { c: Capacity; nowMin?: number; className?: string }) {
  const shape = useRibbonShape();
  if (shape !== "bar") return <RibbonShapes shape={shape} c={c} nowMin={nowMin} className={className} />;
  const day = c.windows[0].start;
  const end = c.windows[c.windows.length - 1].end;
  const span = end - day;
  const pct = (m: number) => ((m - day) / span) * 100;
  const w = (a: number, b: number) => `${((b - a) / span) * 100}%`;
  const finishMin = c.projectedFinish ? c.projectedFinish.hour * 60 + c.projectedFinish.minute : undefined;
  const now = nowMin !== undefined && nowMin >= day && nowMin <= end ? nowMin : undefined;
  const elapsed = nowMin === undefined ? 0 : Math.min(Math.max(nowMin - day, 0), span);
  // The over-tail follows the spill exactly. Its only floor is a few pixels, so a small
  // overrun reads as a small overrun rather than as a fixed amber block.
  const tailPct = c.overflowMin > 0 ? Math.min((c.overflowMin / span) * 100, TAIL_MAX_PCT) : 0;
  const tail = tailPct > 0 ? `max(3px, ${tailPct}%)` : null;

  return (
    <div aria-hidden="true" className={cx("@container relative", className)}>
      <div data-ribbon-day className="relative" style={tail ? { width: `calc(100% - ${tail})` } : undefined}>
        <div className="relative h-4 rounded-(--track-r) ribbon-track sm:h-6">
          <div className="absolute inset-0 overflow-hidden rounded-(--track-r)">
            {c.busy.map((b, i) => (
              <span key={`m${i}`} className="absolute inset-y-0 rounded-[3px] bg-meet-fill" style={{ left: `${pct(b.start)}%`, width: w(b.start, b.end) }} />
            ))}
            {/* Unanswered invitations still count as busy, hatched so they read as not yet decided (SYSTEM_DESIGN.md §5.4). */}
            {c.unanswered?.map((b, i) => (
              <span key={`u${i}`} data-unanswered className="absolute inset-y-0 rounded-[3px] meet-unanswered" style={{ left: `${pct(b.start)}%`, width: w(b.start, b.end) }} />
            ))}
            {c.blocks.map((b, i) => (
              <span key={`b${i}`} className="absolute inset-y-0 rounded-[3px] bg-block-fill" style={{ left: `${pct(b.start)}%`, width: w(b.start, b.end) }} />
            ))}
            {elapsed > 0 && <span className="absolute inset-y-0 left-0 ribbon-elapsed" style={{ width: `${(elapsed / span) * 100}%` }} />}
          </div>
          {/* Both cursors overhang the track by 4 px, so a 16 px phone track still shows them. */}
          {finishMin !== undefined && finishMin >= day && finishMin <= end && (
            <span className="absolute -top-1 -bottom-1 z-1 w-0 border-l-[1.5px] border-dashed border-spare-fill" style={{ left: `${pct(finishMin)}%` }} />
          )}
          {now !== undefined && <span className="absolute -top-1 -bottom-1 z-2 w-0.5 -translate-x-px rounded-[1px] bg-ink shadow-[0_0_0_1px_var(--surface)]" style={{ left: `${pct(now)}%` }} />}
        </div>
        <RibbonTicks day={day} end={end} />
        <RibbonLabelRow day={day} end={end} nowMin={nowMin} finishMin={finishMin} />
      </div>
      {tail && <span className="absolute top-0 right-0 h-4 rounded-r-xs border border-l-0 border-over-line ribbon-over sm:h-6" style={{ width: tail }} />}
    </div>
  );
}

/** True once `waiting` has held for `ms`; false again as soon as it stops. */
function useLate(waiting: boolean, ms: number): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setLate(true), ms);
    return () => {
      clearTimeout(t);
      setLate(false);
    };
  }, [waiting, ms]);
  return waiting && late;
}

export function Ribbon({ c, nowMin, compact = false, connected = true, plannedCount, onTrim, suggestion, interactions, finished = false, otherDay = false, calendarLoading = false }: RibbonProps) {
  // Past four seconds without the calendar, the ribbon is the working-hours variant and says so; it fills in place.
  const stillLoading = useLate(calendarLoading && connected, CALENDAR_PATIENCE_MS);
  if (c.state === "no_work_day") return <p className="text-ink-2">{noWorkDayLine(plannedCount, { outOfOffice: c.reason === "out_of_office", otherDay })}</p>;
  const h = heroState(c);
  // Nothing planned yet (PRODUCT_SPEC.md §9.4 "Empty"): the line says so and invites the morning plan.
  const empty = c.committedMin + c.unscheduledMin === 0 && !finished;

  return (
    <section aria-label={otherDay ? "Spare time" : "Spare time today"} data-glass="" className={cx("rounded-xl border border-line bg-surface", compact ? "p-4" : "px-4 py-4 sm:px-7 sm:py-5.5")}>
      {/* Capacity changes are announced politely (DESIGN_SYSTEM.md §9): one region that stays and only changes its words. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {`${spokenMinutes(h.min)} ${h.over ? "over" : "spare"}`}
      </p>
      {/* The contributors sit on the number's baseline; a column too narrow for both drops them, whole, to a line of their own. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-6 sm:gap-y-2">
        <p className="flex items-baseline gap-2.5 whitespace-nowrap sm:gap-3.5">
          <span className={cx("font-display font-book num text-ink", compact ? "text-title" : "text-hero", !h.over && c.spareMin === 0 && "text-ink-2")}>{formatMinutes(h.min)}</span>
          <span className={cx("font-display-italic", compact ? "text-pane" : "text-em", h.over ? "text-over" : "text-spare")}>{h.over ? "over" : "spare"}</span>
        </p>
        <p className="min-w-0 text-label text-ink-2 num sm:ml-auto sm:text-right sm:text-body-sm sm:whitespace-nowrap">
          {empty ? (
            "nothing planned yet"
          ) : (
            <>
              <b className="font-medium text-ink">{formatMinutes(c.committedMin + c.unscheduledMin)}</b> planned
            </>
          )}
          <span className="text-ink-4"> · </span>
          {stillLoading ? (
            <span data-calendar-loading>calendar still loading</span>
          ) : connected ? (
            <>
              <b className="font-medium text-ink">{formatMinutes(c.busyMin)}</b> in meetings
            </>
          ) : (
            <Link href="/settings#calendar" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
              connect a calendar to see real free time
            </Link>
          )}
          {/* One of the two, never both: the day either finishes or it spills (ruling R3). */}
          {h.finish && (
            <>
              <span className="text-ink-4"> · </span>
              <span className="font-semibold text-spare">{h.finish}</span>
            </>
          )}
          {empty && !otherDay && (
            <>
              <span className="text-ink-4"> · </span>
              <Link href="/plan" className="font-medium text-ink underline decoration-line-strong underline-offset-2">
                Plan your day
              </Link>
            </>
          )}
          {h.over && (h.spill || onTrim) && (
            <>
              <span className="text-ink-4"> · </span>
              {onTrim ? (
                // Tapping the copy opens Trim today (PRODUCT_SPEC.md §9.4 "Over"): a question, never an alarm.
                <button type="button" onClick={onTrim} className="font-semibold text-over underline decoration-over-line underline-offset-2 sm:whitespace-normal">
                  {overSentence(h, suggestion)}
                </button>
              ) : (
                <span className="font-semibold text-over">{h.spill}</span>
              )}
            </>
          )}
        </p>
      </div>

      {/* The drawing stays hidden from assistive tech; the island lays one real button over it, outside that. */}
      <div className={cx("relative", compact ? "mt-3" : "mt-3.5 sm:mt-5")}>
        <RibbonTrack c={c} nowMin={nowMin} />
        {interactions && <RibbonOverlay c={c} connected={connected} {...interactions} />}
      </div>
      {/* Blocks outside the working day are allowed and planned, but not capacity: one quiet line says so (PRODUCT_SPEC.md §10.2). */}
      {c.outsideHoursMin > 0 && <p className="mt-2 text-label text-ink-2 num sm:text-body-sm">{outsideHoursLine(c.outsideHoursMin)}</p>}
      {onTrim && h.over && h.min > WELL_OVER_MIN && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-2 num">
          {formatMinutes(h.min)} more than fits — want help trimming?
          <button type="button" onClick={onTrim} className="-my-1 flex h-11 items-center rounded-sm px-2 font-medium text-ink underline decoration-line-strong underline-offset-2 hover:bg-hover max-sm:-ml-2 sm:h-8 touch:h-11">
            Trim today
          </button>
        </p>
      )}
    </section>
  );
}
