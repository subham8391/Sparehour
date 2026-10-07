// The Calendar's mode commands (SCREENS.md §4, §24): "Calendar: Day / Work week / Week", Cmd/Ctrl+1–3. They join the
// registry (registry.ts) for the palette and the ? overlay, but not the keyboard layer every shell carries: the keys
// mean something only on the Calendar, which listens for them while it is open (`calendarModeKey`), and a browser tab
// keeps them for its own tabs anyway — only the installed app gets them (DECISIONS.md "`Cmd+1/2/3` in a browser
// tab"). From anywhere else the palette's commands open the Calendar in that mode.
import { setCalendarMode, type CalendarMode } from "@/features/calendar-view/calendar-mode";
import type { CommandRun } from "./command-runs";
import { chordMatches, chordOf, parseChord, type KeyEventLike } from "./keys";

const MODES: readonly CalendarMode[] = ["day", "workweek", "week"];

export const CALENDAR_RUNS: readonly CommandRun[] = MODES.map((mode, i) => ({
  id: `calendar.${mode}`,
  shortcut: `mod+${i + 1}`,
  run: (ctx) => {
    setCalendarMode(mode);
    if (ctx.pathname !== "/calendar") ctx.go("/calendar");
  },
}));

/** The mode a key event asks for (Cmd/Ctrl+1–3), or null. */
export function calendarModeKey(e: KeyEventLike, isMac: boolean): CalendarMode | null {
  const chord = chordOf(e, isMac);
  const at = CALENDAR_RUNS.findIndex((r) => chordMatches(chord, parseChord(r.shortcut ?? "")));
  return at < 0 ? null : MODES[at];
}

/** Running as the installed app (a standalone window), where `Cmd/Ctrl+1–3` reach the page. */
export function installedApp(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches);
}
