"use client";
// What every raised panel shares, apart from the panels themselves (popover.tsx): closing on Escape and on a click
// outside, and sitting beside its trigger. Its own module so a shell that only needs these (the sidebar's sync chip)
// does not carry the ⋯ menu with them (Turbopack keeps a module whole).
import { useCallback, useEffect, useRef } from "react";

export type DismissReason = "outside" | "escape";

/**
 * The dismissal both panels share: a click outside or Escape closes, and the
 * returned ref goes on the element that counts as "inside"; `also` is a
 * selector for more of it drawn elsewhere in the document (a portalled
 * panel). The handler is read from a ref, so a new closure on every render
 * never re-subscribes.
 */
export function useDismiss(open: boolean, onDismiss: (reason: DismissReason) => void, also?: string) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(onDismiss);
  useEffect(() => {
    latest.current = onDismiss;
  });
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const el = target instanceof Element ? target : target.parentElement;
      if (ref.current && !ref.current.contains(target) && !(also && el?.closest(also))) latest.current("outside");
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        latest.current("escape");
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, also]);
  return ref;
}

/** Below `sm` (640 px) a panel is a bottom sheet (DESIGN_SYSTEM.md §4a); jsdom and old browsers without matchMedia get the popover. */
export function phoneWidth(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 39.9375rem)").matches;
}

const EDGE = 8;
const GAP = 4;

/**
 * A ref for a fixed panel that sits beside `anchor`: under it (over it with
 * `up`, or when there is more room above), its right or left edge on the
 * anchor's, kept 8 px inside the viewport. Fixed, so no card, mask or
 * scroller around the trigger clips it; it follows the anchor while the page
 * scrolls, and is placed again when it changes size. With no anchor it does
 * nothing.
 */
export function useAnchoredPlacement(anchor: HTMLElement | null, align: "left" | "right" = "right", direction: "up" | "down" = "down") {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el || !anchor) return;
      const place = () => {
        const r = anchor.getBoundingClientRect();
        const h = el.offsetHeight;
        const w = el.offsetWidth;
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const below = vh - r.bottom - GAP - EDGE;
        const above = r.top - GAP - EDGE;
        const up = direction === "up" ? above >= h || above > below : below < h && above > below;
        const top = up ? Math.max(EDGE, r.top - GAP - h) : Math.max(EDGE, Math.min(r.bottom + GAP, vh - EDGE - h));
        const left = Math.max(EDGE, Math.min(align === "right" ? r.right - w : r.left, vw - EDGE - w));
        el.style.top = `${Math.round(top)}px`;
        el.style.left = `${Math.round(left)}px`;
      };
      place();
      window.addEventListener("scroll", place, true);
      window.addEventListener("resize", place);
      // A panel that grows once it is open (a row menu's lazy group arriving after the first paint) is placed again,
      // so its last items never hang below the window where neither a scroll nor a pointer can reach them.
      const grows = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
      grows?.observe(el);
      return () => {
        grows?.disconnect();
        window.removeEventListener("scroll", place, true);
        window.removeEventListener("resize", place);
      };
    },
    [anchor, align, direction],
  );
}
