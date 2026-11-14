// What a line would do to its day, said before it is saved (DECISIONS.md, amendment 2026-11-14): "Leaves 2h 50m
// spare today", "40m more than fits on Thu", or late in the day "~40m spills past 18:00" — the last two in the
// ribbon's own words. The day is the line's do-date; a line for the evening, for the Inbox or for a day already behind
// us takes nothing from a working day, so it says nothing. Pure: it reads the day's capacity with the line already
// on it, from the same engine as Today and Upcoming (day-line.tsx), so the sheet and the ribbon never disagree.
import type { Capacity } from "@/core/capacity";
import type { TaskDraft } from "@/core/quickadd";
import { compareDates, formatMinutes, formatTime, timeFromMinutes, type LocalDate } from "@/core/time";
import { relativeDay } from "@/ui/relative-day";

/** The working day a line would take time from, or null when it takes none. */
export function dayCounted(draft: Pick<TaskDraft, "doDate" | "evening">, today: LocalDate): LocalDate | null {
  if (!draft.doDate || draft.evening) return null;
  return compareDates(draft.doDate, today) < 0 ? null : draft.doDate;
}

/** "today", "tomorrow", "on Thu", "on 22 Sep". */
function when(day: LocalDate, today: LocalDate): string {
  const words = relativeDay(day, today);
  return words === "Today" ? "today" : words === "Tomorrow" ? "tomorrow" : `on ${words}`;
}

export interface DayEffect {
  text: string;
  /** The day would hold more than fits once this is on it. */
  over: boolean;
}

/**
 * The day once the line is on it. `after` is that day's capacity with the line counted; `countedMin` is the default
 * estimate when the line has none of its own, which is said, as Today flags it. A plan that can no longer finish
 * inside the working day is over even when the day's budget looks generous (the ribbon's rule, ruling R3).
 */
export function dayEffect(p: { day: LocalDate; today: LocalDate; after: Pick<Capacity, "spareMin" | "overflowMin" | "windows">; countedMin: number | null }): DayEffect {
  const { after } = p;
  const at = when(p.day, p.today);
  const counted = p.countedMin == null ? "" : ` · counted as ${formatMinutes(p.countedMin)}`;
  if (after.overflowMin > 0) {
    const end = after.windows.length > 0 ? after.windows[after.windows.length - 1].end : 0;
    return { text: `~${formatMinutes(after.overflowMin)} spills past ${formatTime(timeFromMinutes(end))}${counted}`, over: true };
  }
  if (after.spareMin < 0) return { text: `${formatMinutes(-after.spareMin)} more than fits ${at}${counted}`, over: true };
  return { text: `${after.spareMin === 0 ? "Leaves no spare time" : `Leaves ${formatMinutes(after.spareMin)} spare`} ${at}${counted}`, over: false };
}
