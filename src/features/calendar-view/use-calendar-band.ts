"use client";
// The width band the Calendar lays itself out in (DESIGN_SYSTEM.md §4a), measured before paint so a wide screen never
// flashes the phone's Day mode: the viewport's band, stepped down when the grid has less room than the band assumes,
// and a phone held sideways (short and touch) as its own band, which shows three days.
import { useLayoutEffect, useState, type RefObject } from "react";
import { calendarBand, type CalendarBand } from "./grid";

const LANDSCAPE_PHONE = "(orientation: landscape) and (max-height: 500px) and (hover: none)";

export function useCalendarBand(ref: RefObject<HTMLElement | null>): CalendarBand {
  const [band, setBand] = useState<CalendarBand>("phone");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const landscape = typeof window.matchMedia === "function" ? window.matchMedia(LANDSCAPE_PHONE) : null;
    const measure = () => {
      const style = window.getComputedStyle(el);
      const content = el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      setBand(calendarBand(window.innerWidth, content, landscape?.matches ?? false));
    };
    measure();
    landscape?.addEventListener?.("change", measure);
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => {
        window.removeEventListener("resize", measure);
        landscape?.removeEventListener?.("change", measure);
      };
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
      landscape?.removeEventListener?.("change", measure);
    };
  }, [ref]);
  return band;
}
