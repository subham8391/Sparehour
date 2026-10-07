"use client";
// The context pane's edge (SCREENS.md §1 "width is draggable and remembered per view"), an island the panes load:
// a vertical separator laid between the main column and the pane, as a flex item of no width of its own. A mouse
// drags it and a double-click puts the pane's default back; the keyboard steps it with the arrows, Home and End
// (Enter for the default); on a touch screen it is a 44 px grip, and a tap steps the pane through four widths.
//
// The widths are remembered per view in one stored map, drawn as `[data-view="today"] { --pane-w: 420px }` rules
// in one <style> (the shell's frame carries data-view): the theme bootstrap writes it before the first paint, and
// this island rewrites it on every change, so a pane never opens at the wrong width.
import { useRef, useState, type HTMLAttributes, type KeyboardEvent, type PointerEvent } from "react";
import { cx } from "@/ui/cx";

/** The widths per view, and their range; the head script (commands/theme-bootstrap.ts) repeats these three. */
export const PANES_KEY = "sparehour.panes";
export const PANE_MIN = 320;
export const PANE_MAX = 560;
const TAPS = [PANE_MIN, 400, 480, PANE_MAX];

// The edge's look rides with the island rather than in every shell's stylesheet: a 12 px strip over the pane's
// border whose 2 px ink line shows on hover and on keyboard focus; on a touch screen a 44 px grip, always shown.
// Today's list column stops at its reading width, so on a screen with room to spare the day pane is pushed right by
// an auto margin: the edge takes that margin over (and the pane right after it gives its own up), so it stays on the
// pane's border instead of floating in the gap beside the list.
const EDGE_CSS = `@media (min-width:900px){.pane-edge-md{display:block}}@media (min-width:1180px){.pane-edge-lg{display:block;margin-left:auto}.pane-edge-lg+*{margin-left:0}}
.pane-edge{position:absolute;inset-block:0;left:-6px;z-index:10;width:12px;cursor:col-resize;touch-action:none;user-select:none;outline:none}
.pane-edge>span{position:absolute;inset-block:0;left:5px;width:2px;background:var(--ink);opacity:0;transition:opacity var(--dur-fast)}
.pane-edge:hover>span{opacity:.25}.pane-edge:focus-visible>span{opacity:1}
@media (hover:none){.pane-edge{inset-block:auto;top:50%;left:-22px;width:44px;height:44px;translate:0 -50%}.pane-edge>span{inset-block:6px;left:20px;width:4px;border-radius:9999px;background:var(--line-strong);opacity:1}}`;

export const clampPane = (w: number): number => Math.round(Math.min(PANE_MAX, Math.max(PANE_MIN, w)));

/** Every view's stored width. */
export function readPaneWidths(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PANES_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

/** The CSS for a map of widths; the theme bootstrap writes the same rules from storage before the first paint. */
export const paneCss = (widths: Record<string, number>): string =>
  Object.entries(widths)
    .filter(([view]) => /^[a-z-]+$/.test(view))
    .map(([view, w]) => `[data-view="${view}"]{--pane-w:${clampPane(+w)}px}`)
    .join("");

/** Sets one view's width (null: back to the pane's default) and redraws the rules; `save` remembers it. */
export function setPaneWidth(view: string, w: number | null, save = true): void {
  const all = readPaneWidths();
  if (w === null) delete all[view];
  else all[view] = clampPane(w);
  let style = document.getElementById("pane-w");
  if (!style) {
    style = document.createElement("style");
    style.id = "pane-w";
    document.head.appendChild(style);
  }
  style.textContent = paneCss(all);
  if (!save) return;
  try {
    localStorage.setItem(PANES_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: the width holds until the next reload
  }
}

/** `band`: where the edge shows, from the medium band (the task pane) or the wide one (Today's day pane); none hides it. */
export function PaneResizer({ view, label, fallback, band, ...rest }: { view: string; label: string; fallback: number; band?: "md" | "lg" } & HTMLAttributes<HTMLDivElement>) {
  const stored = () => clampPane(readPaneWidths()[view] ?? fallback);
  const [w, setW] = useState(stored);
  const set = (next: number | null, save?: boolean) => {
    setPaneWidth(view, next, save);
    setW(next === null ? fallback : clampPane(next));
  };
  const keys = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 64 : 16;
    const to = ({ ArrowLeft: w + step, ArrowRight: w - step, Home: PANE_MIN, End: PANE_MAX, Enter: null } as Record<string, number | null>)[e.key];
    if (to === undefined) return;
    // Taken here, so the list's arrow keys (J/K, Upcoming's days) leave it alone.
    e.preventDefault();
    set(to);
  };
  // The last pointer that pressed the edge: a double-click restores the default for a mouse only, since two quick
  // taps on a touch screen are two steps, not a reset.
  const pointer = useRef("mouse");
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const type = (pointer.current = e.pointerType);
    // `to` stays null until the pointer has moved 4 px: until then it is a press, not a drag.
    const from = { x: e.clientX, w: stored(), to: null as number | null };
    el.setPointerCapture?.(e.pointerId);
    const move = (m: globalThis.PointerEvent) => {
      if (from.to === null && Math.abs(m.clientX - from.x) < 4) return;
      from.to = from.w + from.x - m.clientX;
      set(from.to, false);
    };
    const end = (u: globalThis.PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      // A drag saves where it let go; a tap on a touch screen steps to the next width (a press the browser took
      // back, pointercancel, is neither).
      if (from.to !== null) set(from.to);
      else if (type !== "mouse" && u.type === "pointerup") set(TAPS.find((t) => t > from.w + 8) ?? PANE_MIN);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  };
  return (
    <div {...rest} className={cx("relative hidden w-0 shrink-0 print:hidden!", band && `pane-edge-${band}`)}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuemin={PANE_MIN}
        aria-valuemax={PANE_MAX}
        aria-valuenow={w}
        tabIndex={0}
        title={`${label}: drag, or use the arrow keys`}
        onFocus={() => setW(stored())}
        onKeyDown={keys}
        onPointerDown={down}
        onDoubleClick={() => pointer.current === "mouse" && set(null)}
        className="pane-edge"
      >
        <span aria-hidden="true" />
      </div>
      <style href="pane-edge" precedence="default">
        {EDGE_CSS}
      </style>
    </div>
  );
}
