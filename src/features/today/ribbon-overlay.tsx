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
import type { Capacity, Interval } from "@/core/capacity";
import { buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { useDismiss } from "@/ui/popover";
import { RAISED } from "@/ui/sheet-parts";
import type { TimelineBlock, TimelineMeeting } from "./hooks/use-today";
import { BREAKDOWN_LABEL, breakdownTerms, ribbonSegments, segmentAction, segmentAt, segmentLine, type RibbonSegment } from "./ribbon-breakdown";

// The breakdown's words and the day's segments live in ribbon-breakdown.ts, free of this file's pointer handling and
// drawing; they are handed on from here so every import of them from the overlay stays as it was.
export { breakdownSentence, breakdownTerms, ribbonSegments, segmentAt, segmentLine, type RibbonSegment, type SegmentKind } from "./ribbon-breakdown";

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

/**
 * The minute at a point on a ring drawn clockwise from its top (Pulse's day): `dx`, `dy` from the centre, `radius` the
 * ring's outer edge. Inside the hole or outside the ring is no minute.
 */
export function ringMinute(dx: number, dy: number, radius: number, start: number, span: number): number | null {
  const r = Math.hypot(dx, dy);
  if (r > radius || r < radius * 0.45) return null;
  let a = Math.atan2(dx, -dy);
  if (a < 0) a += 2 * Math.PI;
  return start + (a / (2 * Math.PI)) * span;
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

  /**
   * The minute of the day under a pointer, measured on the drawn day (the over-tail sits past its right edge). A look
   * whose day is a ring (ribbon-shapes.tsx) tells it by the angle from the ring's top, clockwise; a point off the ring
   * names nothing.
   */
  const minuteAt = (clientX: number, clientY: number): number | null => {
    if (c.windows.length === 0) return null;
    const start = c.windows[0].start;
    const span = c.windows[c.windows.length - 1].end - start;
    const drawing = rootRef.current?.parentElement;
    const ring = drawing?.querySelector("[data-ribbon-ring]")?.getBoundingClientRect();
    if (ring && ring.width > 0) return ringMinute(clientX - (ring.left + ring.width / 2), clientY - (ring.top + ring.height / 2), ring.width / 2, start, span);
    const day = drawing?.querySelector("[data-ribbon-day]")?.getBoundingClientRect();
    if (!day || day.width === 0) return null;
    return start + Math.max(0, ((clientX - day.left) / day.width) * span);
  };
  const segAt = (clientX: number, clientY: number) => {
    const m = minuteAt(clientX, clientY);
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
    setSeg(segAt(e.clientX, e.clientY));
    setOpen("hover");
  };
  const onClick = (e: MouseEvent) => {
    // Enter or Space: the panel, opened at the first segment that does something, or closed again.
    if (e.detail === 0) {
      setSeg((s) => s ?? segs.find((x) => x.kind === "free" || x.kind === "meeting") ?? null);
      setOpen((o) => (o === "pinned" ? null : "pinned"));
      return;
    }
    const s = segAt(e.clientX, e.clientY);
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

  const action = segmentAction(seg);
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
        aria-label={BREAKDOWN_LABEL}
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
          <div id={panelId} role="group" aria-label={BREAKDOWN_LABEL} className={cx(RAISED, "rounded-xl p-3 text-body-sm text-ink-2")}>
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
