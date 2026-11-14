// What a line would do to its day, said before it is saved (DECISIONS.md, amendment 2026-11-14): "Leaves 2h 50m
// spare today" or "40m more than fits on Thu", the second in the ribbon's own words. The day is the line's do-date;
// a line for the evening, for the Inbox or for a day already behind us takes nothing from a working day, so it says
// nothing. Pure: the day's spare time comes from the capacity engine (day-line.tsx reads it as Today does).
import type { TaskDraft } from "@/core/quickadd";
import { compareDates, formatMinutes, type LocalDate } from "@/core/time";
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
 * The day's spare time once the line is on it. A line with no estimate counts as the default, as it will on Today,
 * and says so.
 */
export function dayEffect(p: { day: LocalDate; today: LocalDate; spareMin: number; estimateMin: number | null; defaultEstimateMin: number }): DayEffect {
  const minutes = p.estimateMin ?? p.defaultEstimateMin;
  const after = p.spareMin - minutes;
  const at = when(p.day, p.today);
  const counted = p.estimateMin == null ? ` · counted as ${formatMinutes(minutes)}` : "";
  if (after < 0) return { text: `${formatMinutes(-after)} more than fits ${at}${counted}`, over: true };
  return { text: `${after === 0 ? "Leaves no spare time" : `Leaves ${formatMinutes(after)} spare`} ${at}${counted}`, over: false };
}
