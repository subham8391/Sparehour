"use client";
// The spare-time ribbon (DESIGN_SYSTEM.md §5): the hero number, the day as a
// track — meetings in blue, blocks in ink, spare in green — and the hour ticks.
import type { Capacity } from "@/core/capacity";
import { formatMinutes, formatTime, timeFromMinutes } from "@/core/time";

export function Ribbon({ c, compact = false }: { c: Capacity; compact?: boolean }) {
  if (c.state === "no_work_day") return <p className="text-ink-2">Not a working day.</p>;
  const day = c.windows[0].start;
  const span = c.windows[c.windows.length - 1].end - day;
  const pct = (m: number) => `${((m - day) / span) * 100}%`;
  const w = (a: number, b: number) => `${((b - a) / span) * 100}%`;
  return (
    <div className={`rounded-2xl border border-line bg-surface ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className={`font-display leading-none ${compact ? "text-4xl" : "text-5xl"}`}>{c.spareMin < 0 ? formatMinutes(-c.spareMin) : formatMinutes(c.spareMin)}</span>
          <span className={`font-display italic leading-none ${compact ? "text-2xl" : "text-3xl"} ${c.spareMin < 0 ? "text-over" : "text-spare"}`}>{c.spareMin < 0 ? "over" : "spare"}</span>
        </div>
        <div className="text-right font-mono text-xs text-ink-2">
          <div>{formatMinutes(c.committedMin + c.unscheduledMin, { padMinutes: true })} planned</div>
          <div>{formatMinutes(c.busyMin, { padMinutes: true })} in meetings</div>
          {c.projectedFinish && <div className="text-spare">done by {formatTime(c.projectedFinish)}</div>}
          {c.overflowMin > 0 && <div className="text-over">~{formatMinutes(c.overflowMin)} spills over</div>}
        </div>
      </div>
      <div className="relative mt-4 h-6 overflow-hidden rounded-md bg-spare-soft">
        {c.busy.map((b, i) => (
          <div key={`m${i}`} className="absolute inset-y-0 rounded-sm bg-meet-fill" style={{ left: pct(b.start), width: w(b.start, b.end) }} />
        ))}
        {c.blocks.map((b, i) => (
          <div key={`b${i}`} className="absolute inset-y-0 rounded-sm bg-ink/85" style={{ left: pct(b.start), width: w(b.start, b.end) }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-ink-3">
        {Array.from({ length: Math.floor(span / 60) + 1 }, (_, i) => (
          <span key={i}>{formatTime(timeFromMinutes(day + i * 60)).slice(0, 2)}</span>
        ))}
      </div>
    </div>
  );
}
