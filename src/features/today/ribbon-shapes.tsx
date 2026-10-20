"use client";
// The day drawn in the four looks that were designed with another shape (DECISIONS.md, amendment 2026-10-20):
// Pulse's ring, Tide's wave, Sundial's arc and Metro's line. Each draws exactly what the standard ribbon draws (free
// time, meetings, unanswered invitations, blocks, the hours gone, now, the projected finish and an overrun) in the
// look's colours, and like it is hidden from assistive tech: the prose above says everything. Time runs left to right
// at an even pace in the line, the wave and the arc, so the ribbon's hands (ribbon-overlay.tsx) find the minute under
// a pointer the same way; the ring tells it by angle (data-ribbon-ring). An island: only these looks fetch it.
import type { Capacity, Interval } from "@/core/capacity";
import { formatMinutes, formatTime, timeFromMinutes } from "@/core/time";
import type { RibbonShape } from "@/features/looks/look-shape";
import { cx } from "@/ui/cx";
import { RibbonLabelRow, RibbonTicks } from "./ribbon";

/** The over-tail never takes more than this share, as on the standard ribbon. */
const TAIL_MAX = 0.2;

export interface DayGeometry {
  day: number;
  end: number;
  /** Where a minute falls along the day, 0 to 1, clamped. */
  at: (m: number) => number;
  now?: number;
  /** The share of the day already gone. */
  elapsed: number;
  finish?: number;
  /** The overrun as a share of the day, capped; 0 when the plan fits. */
  tail: number;
  busy: readonly Interval[];
  unanswered: readonly Interval[];
  blocks: readonly Interval[];
  /** Whole hours inside the day. */
  hours: number[];
}

export function dayGeometry(c: Capacity, nowMin?: number): DayGeometry {
  const day = c.windows[0].start;
  const end = c.windows[c.windows.length - 1].end;
  const span = end - day;
  const at = (m: number) => Math.min(1, Math.max(0, (m - day) / span));
  const finishMin = c.projectedFinish ? c.projectedFinish.hour * 60 + c.projectedFinish.minute : undefined;
  const hours: number[] = [];
  for (let h = Math.ceil(day / 60) * 60; h <= end; h += 60) hours.push(h);
  return {
    day,
    end,
    at,
    now: nowMin !== undefined && nowMin >= day && nowMin <= end ? nowMin : undefined,
    elapsed: nowMin === undefined ? 0 : at(nowMin),
    finish: finishMin !== undefined && finishMin >= day && finishMin <= end ? finishMin : undefined,
    tail: c.overflowMin > 0 ? Math.min(c.overflowMin / span, TAIL_MAX) : 0,
    busy: c.busy,
    unanswered: c.unanswered ?? [],
    blocks: c.blocks,
    hours,
  };
}

const pc = (x: number) => `${x * 100}%`;
/** The drawn day's width when an overrun takes the tail end, as on the standard ribbon. */
const dayWidth = (g: DayGeometry) => (g.tail > 0 ? { width: `calc(100% - max(3px, ${pc(g.tail)}))` } : undefined);

// ---------- Metro: a line with a station each hour, meetings as interchanges, a train at now ----------
function Metro({ g, className }: { g: DayGeometry; className?: string }) {
  const segment = (iv: Interval) => ({ left: pc(g.at(iv.start)), width: pc(g.at(iv.end) - g.at(iv.start)) });
  return (
    <div aria-hidden="true" data-shape="metro" className={cx("@container relative", className)}>
      <div data-ribbon-day className="relative" style={dayWidth(g)}>
        <div className="relative h-8">
          <span
            className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
            style={{ background: `linear-gradient(90deg, var(--line-strong) 0 ${pc(g.elapsed)}, var(--spare-fill) ${pc(g.elapsed)} 100%)` }}
          />
          {g.blocks.map((b, i) => (
            <span key={`b${i}`} className="absolute top-1/2 h-1.5 -translate-y-1/2" style={{ ...segment(b), background: "var(--block-fill)" }} />
          ))}
          {g.busy.map((b, i) => (
            <span key={`m${i}`} className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full" style={{ ...segment(b), background: "var(--meet-fill)" }} />
          ))}
          {g.unanswered.map((b, i) => (
            <span key={`u${i}`} data-unanswered className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full meet-unanswered" style={segment(b)} />
          ))}
          {g.hours.map((h) => (
            <span
              key={h}
              data-station
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-surface"
              style={{ left: pc(g.at(h)), borderColor: g.at(h) < g.elapsed ? "var(--line-strong)" : "var(--spare-fill)" }}
            />
          ))}
          {/* A meeting is an interchange: the bigger ringed stop in the meeting's colour, at its middle. */}
          {g.busy.map((b, i) => (
            <span
              key={`x${i}`}
              data-interchange
              className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-ink"
              style={{ left: pc(g.at((b.start + b.end) / 2)), background: "var(--meet-fill)" }}
            />
          ))}
          {g.finish !== undefined && <span className="absolute top-0.5 bottom-0.5 w-0 border-l-[1.5px] border-dashed border-spare-fill" style={{ left: pc(g.at(g.finish)) }} />}
          {g.now !== undefined && (
            <span data-train className="absolute top-1/2 z-2 h-3.5 w-6 -translate-x-1/2 -translate-y-1/2 rounded-[5px] bg-ink shadow-[0_0_0_2px_var(--surface)]" style={{ left: pc(g.at(g.now)) }} />
          )}
        </div>
        <RibbonLabelRow day={g.day} end={g.end} nowMin={g.now} finishMin={g.finish} />
      </div>
      {g.tail > 0 && (
        <span
          className="absolute top-[13px] right-0 h-1.5 rounded-r-full"
          style={{ width: `max(3px, ${pc(g.tail)})`, background: "repeating-linear-gradient(90deg, var(--over-fill) 0 6px, transparent 6px 9px)" }}
        />
      )}
    </div>
  );
}

// ---------- Tide: the water still to come; the hours gone have ebbed; a meeting is a sandbank ----------
const W = 1000;
const H = 48;
function wavePath(y: number, amp: number, humps: number): string {
  const step = W / humps;
  let d = `M0 ${y}`;
  for (let i = 0, x = 0; i < humps; i++, x += step) d += ` Q ${x + step / 2} ${y + (i % 2 === 0 ? -amp : amp)} ${x + step} ${y}`;
  return `${d} V${H} H0 Z`;
}
function Tide({ g, className }: { g: DayGeometry; className?: string }) {
  const x = (m: number) => g.at(m) * W;
  return (
    <div aria-hidden="true" data-shape="wave" className={cx("@container relative", className)}>
      <div data-ribbon-day className="relative" style={dayWidth(g)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-10 w-full overflow-visible rounded-[6px] sm:h-12">
          <path d={wavePath(26, 5, 14)} style={{ fill: "var(--spare-soft)" }} />
          <path data-water d={wavePath(17, 6, 18)} style={{ fill: "var(--spare-fill)" }} />
          {g.blocks.map((b, i) => (
            <rect key={`b${i}`} x={x(b.start)} y={30} width={Math.max(0, x(b.end) - x(b.start))} height={18} rx={4} style={{ fill: "var(--block-fill)" }} />
          ))}
          {g.busy.map((b, i) => (
            <rect key={`m${i}`} data-sandbank x={x(b.start)} y={33} width={Math.max(0, x(b.end) - x(b.start))} height={15} rx={7} style={{ fill: "var(--meet-fill)" }} />
          ))}
          {g.unanswered.map((b, i) => (
            <rect key={`u${i}`} data-unanswered x={x(b.start)} y={33} width={Math.max(0, x(b.end) - x(b.start))} height={15} rx={7} style={{ fill: "var(--meet-fill)", opacity: 0.5 }} />
          ))}
          {g.elapsed > 0 && <rect data-ebb x={0} y={0} width={g.elapsed * W} height={H} style={{ fill: "var(--surface)", opacity: 0.62 }} />}
          {g.finish !== undefined && <line x1={x(g.finish)} y1={2} x2={x(g.finish)} y2={H} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" style={{ stroke: "var(--spare-fill)", strokeWidth: 1.5 }} />}
          {g.now !== undefined && <line x1={x(g.now)} y1={-3} x2={x(g.now)} y2={H + 3} vectorEffect="non-scaling-stroke" style={{ stroke: "var(--ink)", strokeWidth: 2 }} />}
        </svg>
        <RibbonTicks day={g.day} end={g.end} />
        <RibbonLabelRow day={g.day} end={g.end} nowMin={g.now} finishMin={g.finish} />
      </div>
      {g.tail > 0 && <span className="absolute top-0 right-0 h-10 rounded-r-[6px] border border-l-0 border-over-line ribbon-over sm:h-12" style={{ width: `max(3px, ${pc(g.tail)})` }} />}
    </div>
  );
}

// ---------- Sundial: the day as the sun's arc, at an even pace from left to right ----------
const R = 100;
/** A point on the arc for a share of the day: x moves evenly, y follows the semicircle. */
function arcPoint(f: number): [number, number] {
  const x = f * 2 * R;
  return [x, R - Math.sqrt(Math.max(0, R * R - (x - R) ** 2))];
}
function arcPath(f0: number, f1: number): string {
  const n = Math.max(2, Math.ceil((f1 - f0) * 90));
  const pts = Array.from({ length: n + 1 }, (_, i) => arcPoint(f0 + ((f1 - f0) * i) / n));
  return pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(2)} ${py.toFixed(2)}`).join(" ");
}
function Sundial({ g, className }: { g: DayGeometry; className?: string }) {
  const stroke = (color: string, cap: "round" | "butt" = "butt") => ({ stroke: color, strokeWidth: 12, strokeLinecap: cap, fill: "none" });
  const [sx, sy] = arcPoint(g.now !== undefined ? g.at(g.now) : 0);
  const tick = (f: number, inner: number, outer: number) => {
    const [px, py] = arcPoint(f);
    const dx = px - R;
    const dy = py - R;
    const len = Math.hypot(dx, dy) || 1;
    return { x1: R + (dx / len) * inner, y1: R + (dy / len) * inner, x2: R + (dx / len) * outer, y2: R + (dy / len) * outer };
  };
  return (
    <div aria-hidden="true" data-shape="arc" className={cx("flex justify-center", className)}>
      <svg data-ribbon-day viewBox="0 -10 200 128" className="block h-auto w-[200px] overflow-visible sm:w-[240px]">
        <path d={arcPath(0, 1)} style={stroke("var(--line)", "round")} />
        <path data-free d={arcPath(g.elapsed, 1)} style={stroke("var(--spare-fill)", "round")} />
        {g.elapsed > 0 && <path d={arcPath(0, g.elapsed)} style={stroke("var(--line-strong)", "round")} />}
        {g.blocks.map((b, i) => (
          <path key={`b${i}`} d={arcPath(g.at(b.start), g.at(b.end))} style={stroke("var(--block-fill)")} />
        ))}
        {g.busy.map((b, i) => (
          <path key={`m${i}`} data-meeting d={arcPath(g.at(b.start), g.at(b.end))} style={stroke("var(--meet-fill)")} />
        ))}
        {g.unanswered.map((b, i) => (
          <path key={`u${i}`} data-unanswered d={arcPath(g.at(b.start), g.at(b.end))} strokeDasharray="2 2" style={stroke("var(--meet-fill)")} />
        ))}
        {g.hours.map((h) => (
          <line key={h} {...tick(g.at(h), 82, 87)} style={{ stroke: "var(--line-control)", strokeWidth: 1.2 }} />
        ))}
        {g.finish !== undefined && <line {...tick(g.at(g.finish), 88, 112)} strokeDasharray="2.5 2" style={{ stroke: "var(--spare-fill)", strokeWidth: 1.5 }} />}
        {g.now !== undefined && <circle data-sun cx={sx} cy={sy} r={9} style={{ fill: "var(--spare-fill)", stroke: "var(--surface)", strokeWidth: 3 }} />}
        <text x={0} y={116} textAnchor="start" className="num" style={{ fill: "var(--ink-3)", fontSize: 10, fontWeight: 500 }}>
          {formatTime(timeFromMinutes(g.day))}
        </text>
        <text x={200} y={116} textAnchor="end" className="num" style={{ fill: "var(--ink-3)", fontSize: 10, fontWeight: 500 }}>
          {formatTime(timeFromMinutes(g.end))}
        </text>
        {g.now !== undefined && (
          <text x={R} y={88} textAnchor="middle" className="num" style={{ fill: "var(--ink)", fontSize: 13, fontWeight: 700 }}>
            {formatTime(timeFromMinutes(g.now))}
          </text>
        )}
        {g.tail > 0 && (
          <text x={R} y={g.now !== undefined ? 104 : 92} textAnchor="middle" style={{ fill: "var(--over)", fontSize: 10, fontWeight: 600 }}>
            past {formatTime(timeFromMinutes(g.end))}
          </text>
        )}
      </svg>
    </div>
  );
}

// ---------- Pulse: the day as a ring, clockwise from the top, with the totals beside it ----------
const RING = 48;
function ringArc(f0: number, f1: number, r = RING): string {
  const a = (f: number) => [60 + r * Math.sin(f * 2 * Math.PI), 60 - r * Math.cos(f * 2 * Math.PI)];
  const span = Math.min(f1 - f0, 0.9999);
  const [x0, y0] = a(f0);
  const [x1, y1] = a(f0 + span);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${span > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
function Pulse({ g, c, className }: { g: DayGeometry; c: Capacity; className?: string }) {
  const stroke = (color: string, w = 14) => ({ stroke: color, strokeWidth: w, fill: "none" });
  const angle = (f: number) => [60 + RING * Math.sin(f * 2 * Math.PI), 60 - RING * Math.cos(f * 2 * Math.PI)];
  const [nx, ny] = angle(g.now !== undefined ? g.at(g.now) : 0);
  const rows: { label: string; min: number; color: string }[] = [
    { label: "Free", min: Math.max(0, c.spareMin), color: "var(--spare-fill)" },
    { label: "Meetings", min: c.busyMin, color: "var(--meet-fill)" },
    { label: "Planned", min: c.committedMin + c.unscheduledMin, color: "var(--block-fill)" },
  ];
  return (
    <div aria-hidden="true" data-shape="ring" className={cx("flex items-center gap-5 sm:gap-7", className)}>
      <svg data-ribbon-ring viewBox="0 0 120 120" className="size-24 shrink-0 overflow-visible sm:size-28">
        <circle cx={60} cy={60} r={RING} style={stroke("var(--line)")} />
        <path data-free d={ringArc(g.elapsed, 1)} style={stroke("var(--spare-fill)")} />
        {g.elapsed > 0 && <path d={ringArc(0, g.elapsed)} style={stroke("var(--line-strong)")} />}
        {g.blocks.map((b, i) => (
          <path key={`b${i}`} d={ringArc(g.at(b.start), g.at(b.end))} style={stroke("var(--block-fill)")} />
        ))}
        {g.busy.map((b, i) => (
          <path key={`m${i}`} data-meeting d={ringArc(g.at(b.start), g.at(b.end))} style={stroke("var(--meet-fill)")} />
        ))}
        {g.unanswered.map((b, i) => (
          <path key={`u${i}`} data-unanswered d={ringArc(g.at(b.start), g.at(b.end))} strokeDasharray="2 2" style={stroke("var(--meet-fill)")} />
        ))}
        {g.tail > 0 && <path data-over d={ringArc(0, g.tail, RING + 11)} style={stroke("var(--over-fill)", 3)} strokeLinecap="round" />}
        {g.now !== undefined && <circle cx={nx} cy={ny} r={5} style={{ fill: "var(--surface)", stroke: "var(--ink)", strokeWidth: 2.5 }} />}
        <text x={60} y={g.now !== undefined ? 64 : 58} textAnchor="middle" className="num" style={{ fill: "var(--ink)", fontSize: 15, fontWeight: 800 }}>
          {g.now !== undefined ? formatTime(timeFromMinutes(g.now)) : formatTime(timeFromMinutes(g.day))}
        </text>
        {g.now === undefined && (
          <text x={60} y={72} textAnchor="middle" className="num" style={{ fill: "var(--ink-3)", fontSize: 9, fontWeight: 600 }}>
            to {formatTime(timeFromMinutes(g.end))}
          </text>
        )}
      </svg>
      <div className="grid min-w-0 grid-cols-[auto_auto_1fr] items-center gap-x-2.5 gap-y-1.5 text-label text-ink-2 num sm:text-body-sm">
        {rows.map((r) => (
          <span key={r.label} data-total className="contents">
            <span className="size-2.5 rounded-full" style={{ background: r.color }} />
            <span>{r.label}</span>
            <span className="font-semibold text-ink">{formatMinutes(r.min)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RibbonShapes({ shape, c, nowMin, className }: { shape: RibbonShape; c: Capacity; nowMin?: number; className?: string }) {
  const g = dayGeometry(c, nowMin);
  if (shape === "ring") return <Pulse g={g} c={c} className={className} />;
  if (shape === "wave") return <Tide g={g} className={className} />;
  if (shape === "arc") return <Sundial g={g} className={className} />;
  return <Metro g={g} className={className} />;
}
