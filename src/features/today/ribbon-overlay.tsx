"use client";
// The ribbon's hands (SCREENS.md §2.2 "Interactions"): one real button laid
// over the drawing, which stays hidden from assistive tech. With a mouse,
// hovering names the segment under the pointer and shows the breakdown in
// words; a click on free time opens quick add for today, and a click on a
// meeting shows it on the timeline. A tap (touch) or Enter (keyboard) opens
// the same panel, with those two as buttons, and ← → step along the day. The
// equation is the button's accessible description, so it is read without
// opening anything. An island: Today's shell carries only the dynamic import.
import { useId, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { round5 } from "@/core/capacity/intervals";
import type { Capacity, Interval } from "@/core/capacity";
import { formatMinutes, formatTime, timeFromMinutes } from "@/core/time";
import { buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { useDismiss } from "@/ui/popover";
import { RAISED } from "@/ui/sheet-parts";
import type { TimelineBlock, TimelineMeeting } from "./hooks/use-today";

export interface RibbonOverlayProps {
  c: Capacity;
  /** False without a calendar: the equation leaves out the meetings it cannot know. */
  connected: boolean;
  bufferPct: number;
  /** Titles for the drawn meetings and blocks; the capacity's intervals stay the geometry. */
  meetings: readonly TimelineMeeting[];
  blocks: readonly TimelineBlock[];
  /** Free time clicked: quick add, prefilled with the day shown. */
  onAdd: () => void;
  /** The day free time adds to, in its hint: "today", or the day Today was stepped to ("Thu 8 Oct"). */
  addFor?: string;
  /** A meeting clicked: the timeline scrolls to it and marks it. */
  onMeeting: (m: Interval) => void;
}

export type SegmentKind = "meeting" | "block" | "free" | "off" | "over";

export interface RibbonSegment {
  kind: SegmentKind;
  start: number;
  end: number;
  /** What it is, in words: a meeting's title, a block's, "2 meetings". */
  name: string;
}

const KIND_WORD: Record<SegmentKind, string> = { meeting: "Meeting", block: "Block", free: "Free", off: "Outside working hours", over: "Over" };

const inside = <T extends Interval>(list: readonly T[], iv: Interval) => list.filter((x) => x.start < iv.end && x.end > iv.start);
function named(list: readonly { title: string }[], one: string, many: string): string {
  if (list.length === 1) return list[0].title;
  return list.length > 1 ? `${list.length} ${many}` : one;
}

/** The day as the ribbon draws it, in clock order: meetings, blocks, free time, and the hours between work windows. */
export function ribbonSegments(c: Capacity, meetings: readonly TimelineMeeting[], blocks: readonly TimelineBlock[]): RibbonSegment[] {
  const day = c.windows[0]?.start ?? 0;
  const end = c.windows[c.windows.length - 1]?.end ?? 0;
  const segs: RibbonSegment[] = [
    ...c.busy.map((b) => ({ kind: "meeting" as const, ...b, name: named(inside(meetings, b), "Busy", "meetings") })),
    ...c.blocks.map((b) => ({ kind: "block" as const, ...b, name: named(inside(blocks, b), "Block", "blocks") })),
    ...c.free.map((f) => ({ kind: "free" as const, ...f, name: "Free" })),
  ];
  for (let i = 1; i < c.windows.length; i++) segs.push({ kind: "off", start: c.windows[i - 1].end, end: c.windows[i].start, name: KIND_WORD.off });
  return segs.filter((s) => s.end > s.start && s.start >= day && s.end <= end).sort((a, b) => a.start - b.start);
}

/** The segment under a minute of the day; past the end of the day while it spills, the overhang. */
export function segmentAt(segs: readonly RibbonSegment[], c: Capacity, minute: number): RibbonSegment | null {
  const end = c.windows[c.windows.length - 1]?.end ?? 0;
  if (minute >= end && c.overflowMin > 0) return { kind: "over", start: end, end: end + c.overflowMin, name: `${formatMinutes(c.overflowMin)} more than fits` };
  // The last pixel of the day belongs to the day's last segment.
  const m = Math.min(minute, end - 1);
  return segs.find((s) => m >= s.start && m < s.end) ?? null;
}

const range = (s: Interval) => `${formatTime(timeFromMinutes(s.start))}–${formatTime(timeFromMinutes(s.end))}`;

/** The tooltip line: "Meeting · Design review · 10:00–11:00 · 1h". The kind is a word, never only a colour (DESIGN_SYSTEM.md §9). */
export function segmentLine(s: RibbonSegment): string {
  if (s.kind === "over") return `${KIND_WORD.over} · ${s.name}`;
  const head = s.kind === "meeting" || s.kind === "block" ? `${KIND_WORD[s.kind]} · ${s.name}` : s.name;
  return `${head} · ${range(s)} · ${formatMinutes(s.end - s.start)}`;
}

/**
 * The breakdown in words (PRODUCT_SPEC.md §9.1, the same sentence as the reveal and Settings): "9h working − 2h in
 * meetings − 1h 20m buffer (15% of your working day) − 2h 20m planned = 3h 20m spare". Without a calendar the
 * meetings term is left out; a buffer capped by meetings drops the share it no longer is.
 */
export function breakdownTerms(c: Capacity, bufferPct: number, connected: boolean): { terms: string[]; result: string } {
  const capped = c.bufferMin < round5((c.workMin * bufferPct) / 100);
  const terms = [`${formatMinutes(c.workMin)} working`];
  if (connected) terms.push(`${formatMinutes(c.busyMin)} in meetings`);
  terms.push(capped ? `${formatMinutes(c.bufferMin)} buffer` : `${formatMinutes(c.bufferMin)} buffer (${bufferPct}% of your working day)`);
  terms.push(`${formatMinutes(c.committedMin + c.unscheduledMin)} planned`);
  return { terms, result: c.spareMin >= 0 ? `${formatMinutes(c.spareMin)} spare` : `${formatMinutes(-c.spareMin)} over` };
}

export function breakdownSentence(c: Capacity, bufferPct: number, connected: boolean): string {
  const { terms, result } = breakdownTerms(c, bufferPct, connected);
  return `${terms.join(" − ")} = ${result}`;
}

export default function RibbonOverlay({ c, connected, bufferPct, meetings, blocks, onAdd, onMeeting, addFor = "today" }: RibbonOverlayProps) {
  const [open, setOpen] = useState<"hover" | "pinned" | null>(null);
  const [seg, setSeg] = useState<RibbonSegment | null>(null);
  const pointer = useRef<string>("mouse");
  const rootRef = useDismiss(open === "pinned", () => setOpen(null));
  const descId = useId();
  const panelId = useId();
  const segs = ribbonSegments(c, meetings, blocks);
  const { terms, result } = breakdownTerms(c, bufferPct, connected);
  const sentence = `${terms.join(" − ")} = ${result}`;

  /** The minute of the day under a pointer, measured on the drawn day (the over-tail sits past its right edge). */
  const minuteAt = (clientX: number): number | null => {
    const day = rootRef.current?.parentElement?.querySelector("[data-ribbon-day]")?.getBoundingClientRect();
    if (!day || day.width === 0 || c.windows.length === 0) return null;
    const start = c.windows[0].start;
    const span = c.windows[c.windows.length - 1].end - start;
    return start + Math.max(0, ((clientX - day.left) / day.width) * span);
  };
  const segAt = (clientX: number) => {
    const m = minuteAt(clientX);
    return m === null ? null : segmentAt(segs, c, m);
  };
  const act = (s: RibbonSegment | null) => {
    if (s?.kind === "free") onAdd();
    else if (s?.kind === "meeting") onMeeting({ start: s.start, end: s.end });
    else return false;
    setOpen(null);
    return true;
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || open === "pinned") return;
    setSeg(segAt(e.clientX));
    setOpen("hover");
  };
  const onClick = (e: MouseEvent) => {
    // Enter or Space: the panel, opened at the first segment that does something, or closed again.
    if (e.detail === 0) {
      setSeg((s) => s ?? segs.find((x) => x.kind === "free" || x.kind === "meeting") ?? null);
      setOpen((o) => (o === "pinned" ? null : "pinned"));
      return;
    }
    const s = segAt(e.clientX);
    if (pointer.current === "mouse" && act(s)) return;
    // A tap: the panel for what was tapped; tapping the same thing again closes it.
    const same = open === "pinned" && s?.start === seg?.start && s?.kind === seg?.kind;
    setSeg(s);
    setOpen(same ? null : "pinned");
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = seg ? segs.findIndex((s) => s.start === seg.start && s.kind === seg.kind) : -1;
    const next = segs[Math.min(segs.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1)))] ?? null;
    setSeg(next);
    setOpen("pinned");
  };

  const action = seg?.kind === "free" ? "Add something" : seg?.kind === "meeting" ? "Show on timeline" : null;
  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse" && open === "hover") setOpen(null);
      }}
    >
      <button
        type="button"
        aria-label="Spare time breakdown"
        aria-describedby={descId}
        aria-expanded={open !== null}
        aria-controls={open ? panelId : undefined}
        onPointerDown={(e) => (pointer.current = e.pointerType)}
        onPointerMove={onMove}
        onClick={onClick}
        onKeyDown={onKey}
        className={cx("absolute inset-x-0 -top-1 h-[calc(100%+0.5rem)] min-h-11 w-full rounded-xs focus-visible:outline-offset-2", seg && open === "hover" && (seg.kind === "free" || seg.kind === "meeting") ? "cursor-pointer" : "cursor-default")}
      />
      <span id={descId} className="sr-only">
        {sentence}
      </span>
      {open && (
        // Below the drawing, with no gap between, so the pointer can travel from the track into the panel.
        <div className="absolute top-full left-0 z-30 w-full max-w-80 pt-1">
          <div id={panelId} role="group" aria-label="Spare time breakdown" className={cx(RAISED, "rounded-xl p-3 text-body-sm text-ink-2")}>
            {seg && (
              <div className="mb-2.5 flex flex-col gap-1.5 border-b border-line pb-2.5">
                <p aria-live="polite" className="font-medium text-ink num">
                  {segmentLine(seg)}
                </p>
                {action &&
                  (open === "hover" ? (
                    <p className="text-label text-ink-3">{seg.kind === "free" ? `Click to add something for ${addFor}` : "Click to show it on the timeline"}</p>
                  ) : (
                    <button type="button" onClick={() => act(seg)} className={cx(buttonClass({ variant: "secondary" }), "self-start")}>
                      {action}
                    </button>
                  ))}
              </div>
            )}
            {/* The equation, one term a line, the result under a rule. */}
            <ul className="flex flex-col gap-0.5 num">
              {terms.map((t, i) => (
                <li key={t}>
                  <span aria-hidden="true" className="inline-block w-3 text-ink-3">
                    {i > 0 ? "−" : ""}
                  </span>
                  {t}
                </li>
              ))}
              <li className="mt-1 border-t border-line pt-1 font-medium text-ink">
                <span aria-hidden="true" className="inline-block w-3 text-ink-3">
                  =
                </span>
                {result}
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
