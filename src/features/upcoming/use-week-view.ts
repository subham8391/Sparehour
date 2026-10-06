"use client";
// How the week planner is laid out on this device: the "Calendar week" view
// preference (SCREENS.md §3), remembered per device like the theme's local
// copy, and the width band the planner falls in (DESIGN_SYSTEM.md §4a),
// measured before paint so a wide screen never flashes the phone layout.
import { useCallback, useLayoutEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { weekBand, type WeekBand, type WeekMode } from "./week";

export const WEEK_MODE_KEY = "sparehour.upcoming.week";
const listeners = new Set<() => void>();
/** Where storage refuses a write (a private window), the choice lives for as long as the page does. */
let unsaved: WeekMode | null = null;

function readMode(): WeekMode {
  if (unsaved) return unsaved;
  try {
    return window.localStorage.getItem(WEEK_MODE_KEY) === "calendar" ? "calendar" : "rolling";
  } catch {
    return "rolling";
  }
}

function subscribeMode(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The remembered week mode and its setter. */
export function useWeekMode(): [WeekMode, (mode: WeekMode) => void] {
  const mode = useSyncExternalStore(subscribeMode, readMode, () => "rolling" as const);
  const setMode = useCallback((next: WeekMode) => {
    try {
      if (next === "calendar") window.localStorage.setItem(WEEK_MODE_KEY, next);
      else window.localStorage.removeItem(WEEK_MODE_KEY);
      unsaved = null;
    } catch {
      unsaved = next;
    }
    for (const l of listeners) l();
  }, []);
  return [mode, setMode];
}

/** The band of the element the planner lays itself out in: the viewport's band, stepped down when it has less room. */
export function useWeekBand(ref: RefObject<HTMLElement | null>): WeekBand {
  const [band, setBand] = useState<WeekBand>("phone");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const style = window.getComputedStyle(el);
      const content = el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      setBand(weekBand(window.innerWidth, content));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return band;
}
