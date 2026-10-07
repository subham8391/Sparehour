// The Calendar's mode (SCREENS.md §4): Day · Work week · Week, remembered per device like Upcoming's week view.
// Small on purpose: the keyboard layer every shell carries sets it (`Cmd+1/2/3`, the palette's "Calendar: …"), and
// the Calendar reads it (use-calendar-view.ts, which no shell carries). In a browser tab the browser keeps
// `Cmd/Ctrl+1–3` for its own tabs, so the keys answer only in the installed app (DECISIONS.md "`Cmd+1/2/3` in a
// browser tab"); the on-screen control and the palette cover the rest.
export type CalendarMode = "day" | "workweek" | "week";
export const CALENDAR_MODE_KEY = "sparehour.calendar.mode";

const listeners = new Set<() => void>();
/** Where storage refuses a write (a private window), the choice lives for as long as the page does. */
let unsaved: CalendarMode | null = null;

const isMode = (v: unknown): v is CalendarMode => v === "day" || v === "workweek" || v === "week";

/** The remembered mode; a first visit opens on the week. */
export function readCalendarMode(): CalendarMode {
  if (unsaved) return unsaved;
  try {
    const v = window.localStorage.getItem(CALENDAR_MODE_KEY);
    return isMode(v) ? v : "week";
  } catch {
    return "week";
  }
}

export function setCalendarMode(mode: CalendarMode): void {
  try {
    window.localStorage.setItem(CALENDAR_MODE_KEY, mode);
    unsaved = null;
  } catch {
    unsaved = mode;
  }
  for (const l of listeners) l();
}

/** For the Calendar's own hook (use-calendar-view.ts): told whenever the mode changes, here or in another tab. */
export function subscribeCalendarMode(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
