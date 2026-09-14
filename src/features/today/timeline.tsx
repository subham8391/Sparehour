"use client";
// The day timeline (DESIGN_SYSTEM.md §5 "Timeline"): hour lines, meetings,
// blocks, the now-line and the projected finish. Drag-to-block arrives with P7.
import type { Capacity } from "@/core/capacity";
import { formatTime, timeFromMinutes, type Instant } from "@/core/time";

export function Timeline({ c, now, zone }: { c: Capacity; now: Instant; zone: string }) {
  const start = c.windows[0].start;
  const end = c.windows[c.windows.length - 1].end;
  const px = 1.1; // px per minute
  const y = (m: number) => (m - start) * px;
  const z = now.toZonedDateTimeISO(zone);
  const nowMin = z.hour * 60 + z.minute;
  return (
    <div className="relative" style={{ height: (end - start) * px }}>
      {Array.from({ length: Math.floor((end - start) / 60) + 1 }, (_, i) => (
        <div key={i} className="absolute left-12 right-0 border-t border-line" style={{ top: y(start + i * 60) }}>
          <span className="absolute -left-12 -top-2 w-10 text-right font-mono text-[11px] text-ink-3">{formatTime(timeFromMinutes(start + i * 60))}</span>
        </div>
      ))}
      {c.busy.map((b, i) => (
        <div key={`m${i}`} className="absolute left-14 right-0 overflow-hidden rounded-md border-l-[3px] border-meet-fill bg-meet-soft px-2 text-xs text-meet" style={{ top: y(b.start) + 1, height: Math.max(12, (b.end - b.start) * px - 2) }}>
          meeting <span className="font-mono opacity-75">{formatTime(timeFromMinutes(b.start))}</span>
        </div>
      ))}
      {c.blocks.map((b, i) => (
        <div key={`b${i}`} className="absolute left-14 right-0 overflow-hidden rounded-md border-l-[3px] border-ink bg-surface-2 px-2 text-xs" style={{ top: y(b.start) + 1, height: Math.max(12, (b.end - b.start) * px - 2) }}>
          block <span className="font-mono opacity-75">{formatTime(timeFromMinutes(b.start))}</span>
        </div>
      ))}
      {nowMin >= start && nowMin <= end && <div className="absolute left-12 right-0 border-t-[1.5px] border-ink" style={{ top: y(nowMin) }} />}
      {c.projectedFinish && (
        <div className="absolute left-12 right-0 border-t border-dashed border-spare" style={{ top: y(c.projectedFinish.hour * 60 + c.projectedFinish.minute) }}>
          <span className="absolute right-0 -top-5 rounded-md bg-spare-soft px-2 font-mono text-[11px] text-spare">done by {formatTime(c.projectedFinish)}</span>
        </div>
      )}
    </div>
  );
}
