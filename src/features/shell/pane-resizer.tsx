"use client";
// The context pane's edge (SCREENS.md §1 "width is draggable and remembered per view"): a vertical separator laid
// between the main column and the pane, as a flex item of no width of its own. A mouse drags it and a double-click
// puts the pane's default back; the keyboard steps it with the arrows, Home and End (Enter for the default); on a
// touch screen it is a 44 px grip, and a tap steps the pane through four widths. The width is `--pane-w` (panes.ts).
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { cx } from "@/ui/cx";
import { PANE_MAX, PANE_MIN, clampPane, paneWidth, setPaneWidth } from "./panes";

const TAPS = [PANE_MIN, 400, 480, PANE_MAX];

export function PaneResizer({ view, label, fallback, className }: { view: string; label: string; fallback: number; className: string }) {
  const [w, setW] = useState(() => paneWidth(view) ?? fallback);
  const set = (next: number | null, save = true) => {
    setPaneWidth(view, next, save);
    setW(next === null ? fallback : clampPane(next));
  };
  const keys = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 64 : 16;
    const to = ({ ArrowLeft: w + step, ArrowRight: w - step, Home: PANE_MIN, End: PANE_MAX, Enter: null } as Record<string, number | null>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    set(to);
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const from = { x: e.clientX, w: paneWidth(view) ?? w, last: 0 };
    el.setPointerCapture?.(e.pointerId);
    const move = (m: globalThis.PointerEvent) => {
      if (!from.last && Math.abs(m.clientX - from.x) < 4) return;
      from.last = from.w + from.x - m.clientX;
      set(from.last, false);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      // A drag saves where it let go; a tap on a touch screen steps to the next width.
      if (from.last) set(from.last);
      else if (e.pointerType !== "mouse") set(TAPS.find((t) => t > w + 8) ?? PANE_MIN);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  return (
    <div className={cx("relative hidden w-0 shrink-0 print:hidden!", className)}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuemin={PANE_MIN}
        aria-valuemax={PANE_MAX}
        aria-valuenow={w}
        tabIndex={0}
        title={`${label}: drag, or use the arrow keys`}
        onKeyDown={keys}
        onPointerDown={down}
        onDoubleClick={() => set(null)}
        className="group absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none select-none focus-visible:outline-none touch:inset-y-auto touch:top-1/2 touch:-left-5.5 touch:size-11 touch:-translate-y-1/2"
      >
        <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ink opacity-0 transition-opacity dur-fast group-hover:opacity-25 group-focus-visible:opacity-100 touch:inset-y-1.5 touch:w-1 touch:rounded-full touch:bg-line-strong touch:opacity-100" />
      </div>
    </div>
  );
}
