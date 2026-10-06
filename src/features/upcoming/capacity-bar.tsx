// A day's capacity on the week planner: the 6 px bar (DESIGN_SYSTEM.md §5
// "Heights": no ticks, no cursors) in the Today ribbon's segment language —
// the dotted spare track, meetings in meet-fill, blocks in block-fill, the
// hatched over-tail past the end of the day — and its one-line readout
// (SCREENS.md §3). A day without working hours draws a flat grey track. The
// drawing is hidden from assistive tech; the readout says it in words.
import type { Capacity } from "@/core/capacity";
import { cx } from "@/ui/cx";
import type { DayReadout } from "./week";

/** As on the hero: a wild overrun never takes more than a fifth of the bar. */
const TAIL_MAX_PCT = 20;

export function DayBar({ c, readout, className }: { c: Capacity; readout: DayReadout; className?: string }) {
  if (c.state === "no_work_day" || c.windows.length === 0) return <div aria-hidden="true" data-bar="off" className={cx("h-1.5 rounded-xs bg-surface-2", className)} />;
  const start = c.windows[0].start;
  const span = c.windows[c.windows.length - 1].end - start;
  const left = (m: number) => `${((m - start) / span) * 100}%`;
  const width = (a: number, b: number) => `${((b - a) / span) * 100}%`;
  const tailPct = readout.kind === "over" ? Math.min((readout.min / span) * 100, TAIL_MAX_PCT) : 0;
  return (
    <div aria-hidden="true" data-bar={readout.kind} className={cx("flex h-1.5", className)}>
      {/* The dot grid sits on the bar's middle line: at 6 px the hero's offset would cut every dot in half. */}
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-xs ribbon-track [background-position:2px_1px]">
        {c.busy.map((b, i) => (
          <span key={`m${i}`} data-segment="meeting" className="absolute inset-y-0 rounded-[2px] bg-meet-fill" style={{ left: left(b.start), width: width(b.start, b.end) }} />
        ))}
        {c.blocks.map((b, i) => (
          <span key={`b${i}`} data-segment="block" className="absolute inset-y-0 rounded-[2px] bg-block-fill" style={{ left: left(b.start), width: width(b.start, b.end) }} />
        ))}
      </div>
      {tailPct > 0 && <span data-segment="over" className="shrink-0 rounded-r-xs border border-l-0 border-over-line ribbon-over" style={{ width: `max(3px, ${tailPct}%)` }} />}
    </div>
  );
}

/** "3h 20m spare" in the spare role, "40m over" in the over role, "no working hours" quiet. Never red. */
export function ReadoutText({ readout, className }: { readout: DayReadout; className?: string }) {
  return (
    <span
      className={cx(
        "text-label font-medium whitespace-nowrap num",
        readout.kind === "over" ? "text-over" : readout.kind === "off" ? "font-normal text-ink-3" : readout.min === 0 ? "text-ink-2" : "text-spare",
        className,
      )}
    >
      {readout.text}
    </span>
  );
}
