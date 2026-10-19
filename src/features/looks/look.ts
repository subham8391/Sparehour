// The look (DECISIONS.md, amendment 2026-10-20): Sky is in every shell's stylesheet; any other look is one stylesheet
// under public/looks/ with its own faces, added to <head> only when chosen. A choice stamps data-look on <html> (none
// for Sky) and swaps that stylesheet; the pre-paint script (commands/theme-bootstrap.ts) does the same from this
// device's copy before the first paint. Tiny on purpose: every shell carries it. The names and swatches the picker
// shows are in catalog.ts, which only Settings loads.
import { BUILD_ID } from "@/data/build-id";

export const LOOK_KEY = "sparehour.look";
export const DEFAULT_LOOK = "sky";
/** The <link> that carries a non-default look's stylesheet. */
export const LOOK_LINK_ID = "look-css";

/** The shape the database checks too (migration 20261020000100): lowercase words joined by hyphens. */
export const isLookId = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-z-]{0,23}$/.test(v);

export const lookHref = (id: string) => `/looks/${id}.css?v=${BUILD_ID}`;

export function readLook(): string {
  try {
    const v = localStorage.getItem(LOOK_KEY);
    return isLookId(v) ? v : DEFAULT_LOOK;
  } catch {
    return DEFAULT_LOOK;
  }
}

/** Shows `id` now and remembers it on this device. An unknown shape falls back to Sky. */
export function applyLook(id: string): void {
  const look = isLookId(id) ? id : DEFAULT_LOOK;
  const root = document.documentElement;
  const existing = document.getElementById(LOOK_LINK_ID) as HTMLLinkElement | null;
  if (look === DEFAULT_LOOK) {
    delete root.dataset.look;
    existing?.remove();
  } else {
    const href = lookHref(look);
    if (!existing || existing.getAttribute("href") !== href) {
      const link = document.createElement("link");
      link.id = LOOK_LINK_ID;
      link.rel = "stylesheet";
      link.href = href;
      // The attribute moves only once the new sheet is in, so a switch never shows the new look's name on the old
      // look's colours (or the default's) for a frame.
      link.addEventListener("load", () => {
        root.dataset.look = look;
        if (existing && existing !== link) existing.remove();
      });
      link.addEventListener("error", () => link.remove());
      if (existing) existing.after(link);
      else document.head.appendChild(link);
    } else {
      root.dataset.look = look;
    }
  }
  try {
    if (look === DEFAULT_LOOK) localStorage.removeItem(LOOK_KEY);
    else localStorage.setItem(LOOK_KEY, look);
  } catch {
    // storage can be unavailable (private mode); the look still applies for this load
  }
}

/** Morning, afternoon, evening or night: the sky behind Sky (and any look that paints one) follows the hour. */
export type DayPart = "morning" | "afternoon" | "evening" | "night";
export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}
