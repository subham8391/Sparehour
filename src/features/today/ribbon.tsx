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
import type { CSSProperties } from "react";
import type { Capacity } from "@/core/capacity";
import { formatMinutes, formatTime, timeFromMinutes } from "@/core/time";
import { cx } from "@/ui/cx";
import type { RibbonOverlayProps } from "./ribbon-overlay";

// The ribbon's hands — the breakdown, the segment names, a click on free time or a meeting (SCREENS.md §2.2) — are
// not needed for the first paint: an island, fetched when the browser is idle (`preloadRibbonOverlay`).
const loadRibbonOverlay = () => import("./ribbon-overlay");
export const preloadRibbonOverlay = () => loadRibbonOverlay();
const RibbonOverlay = dynamic(loadRibbonOverlay, { ssr: false });

/** Hour labels this close to a cursor's time yield to it: 35 min is 49 px on a 760 px track, 32 px on a phone's. */
const YIELD_MIN = 35;
/** Below 340 px of track only every second hour is labelled and a cursor clears a wider berth. */
const YIELD_NARROW_MIN = 60;
/** The over-tail never takes more than this share of the card, so a wild overrun cannot squeeze the day to nothing. */
const TAIL_MAX_PCT = 20;

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
}

/** Over by more than this, the ribbon offers Trim today inline (PRODUCT_SPEC.md §9.4 "Well over"). */
export const WELL_OVER_MIN = 120;

/** The over state's one sentence: the spill (or the overage) and, when there is one, the suggested move. */
export function overSentence(h: Pick<HeroState, "min" | "spill">, suggestion?: string | null): string {
  return `${h.spill ?? `${formatMinutes(h.min)} more than fits`}${suggestion ? ` — move ${suggestion} to tomorrow` : ""}`;
}

/** "3 hours 20 minutes", for the live region: a screen reader reads "3h 20m" letter by letter in places. */
export function spokenMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const part = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (h === 0) return part(m, "minute");
  return m === 0 ? part(h, "hour") : `${part(h, "hour")} ${part(m, "minute")}`;
}

/** SCREENS.md §2.2, non-working day: "No working hours today · 3 things planned". */
export function noWorkDayLine(planned: number | undefined): string {
  return planned ? `No working hours today · ${planned} ${planned === 1 ? "thing" : "things"} planned` : "No working hours today";
}

export interface RibbonLabel {
  min: number;
  text: string;
  kind: "hour" | "now" | "finish";
  /** `narrow` hides the label on a track under 340 px; `always` hides it because a cursor's time sits there. */
  hide: "never" | "narrow" | "always";
}

/** The hero's one state (ruling R3): the spare figure and a spill never share a card. */
export interface HeroState {
  /** True when the plan cannot fit: it spills past the end of the day, or it is already over the day's budget. */
  over: boolean;
  /** The figure the hero prints: what is spare, or how much is over. */
  min: number;
  /** One sentence naming the spill, when there is one: "~40m spills past 18:00". */
  spill: string | null;
  /** "done by 16:25" — only when the day finishes with nothing left over. */
  finish: string | null;
}

/**
 * Which state the hero is in, for both heroes at once. A plan that spills past
 * the end of the day is over even when the day's budget still looks generous —
 * which is what every evening looks like — so the amber sentence and the green
 * figure can never appear together (ruling R3). After the working day with
 * nothing over, the day's spare figure simply stands.
 */
export function heroState(c: Capacity): HeroState {
  const end = c.windows.length > 0 ? c.windows[c.windows.length - 1].end : 0;
  const spills = c.overflowMin > 0;
  return {
    over: spills || c.spareMin < 0,
    min: spills ? c.overflowMin : Math.abs(c.spareMin),
    spill: spills ? `~${formatMinutes(c.overflowMin)} spills past ${formatTime(timeFromMinutes(end))}` : null,
    finish: !spills && c.projectedFinish ? `done by ${formatTime(c.projectedFinish)}` : null,
  };
}

/** "1h planned outside working hours" (PRODUCT_SPEC.md §10.2). */
export const outsideHoursLine = (min: number) => `${formatMinutes(min)} planned outside working hours`;

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

/**
 * The instrument itself: track, segments, elapsed hatch, the two cursors, the
 * engraved ticks, the one label row and the over-tail. Everything it says is
 * in the prose beside it, so assistive tech skips the drawing.
 */
export function RibbonTrack({ c, nowMin, className }: { c: Capacity; nowMin?: number; className?: string }) {
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
  // Whole hours only under the ticks: a half-hour start keeps the tile aligned to the clock, not to the window's edge.
  const firstHour = Math.ceil(day / 60) * 60;
  const lastHour = Math.floor(end / 60) * 60;
  const labels = ribbonLabels(day, end, nowMin, finishMin);
  // The first label sits flush left and the last flush right, so nothing pokes out of the card.
  const align = (p: number) => (p < 4 ? "" : p > 96 ? "-translate-x-full" : "-translate-x-1/2");

  return (
    <div aria-hidden="true" className={cx("@container relative", className)}>
      <div data-ribbon-day className="relative" style={tail ? { width: `calc(100% - ${tail})` } : undefined}>
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
          {/* Both cursors overhang the track by 4 px, so a 16 px phone track still shows them. */}
          {finishMin !== undefined && finishMin >= day && finishMin <= end && (
            <span className="absolute -top-1 -bottom-1 z-1 w-0 border-l-[1.5px] border-dashed border-spare-fill" style={{ left: `${pct(finishMin)}%` }} />
          )}
          {now !== undefined && <span className="absolute -top-1 -bottom-1 z-2 w-0.5 -translate-x-px rounded-[1px] bg-ink shadow-[0_0_0_1px_var(--surface)]" style={{ left: `${pct(now)}%` }} />}
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
      {tail && <span className="absolute top-0 right-0 h-4 rounded-r-xs border border-l-0 border-over-line ribbon-over sm:h-6" style={{ width: tail }} />}
    </div>
  );
}

export function Ribbon({ c, nowMin, compact = false, connected = true, plannedCount, onTrim, suggestion, interactions }: RibbonProps) {
  if (c.state === "no_work_day") return <p className="text-ink-2">{noWorkDayLine(plannedCount)}</p>;
  const h = heroState(c);
  // Nothing planned yet (PRODUCT_SPEC.md §9.4 "Empty"): the line says so and invites the morning plan.
  const empty = c.committedMin + c.unscheduledMin === 0;

  return (
    <section aria-label="Spare time today" className={cx("rounded-xl border border-line bg-surface", compact ? "p-4" : "px-4 py-4 sm:px-7 sm:py-5.5")}>
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
          {connected ? (
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
          {empty && (
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
          <button type="button" onClick={onTrim} className="-my-1 flex h-11 items-center rounded-sm px-2 font-medium text-ink underline decoration-line-strong underline-offset-2 hover:bg-hover max-sm:-ml-2 sm:h-8">
            Trim today
          </button>
        </p>
      )}
    </section>
  );
}
