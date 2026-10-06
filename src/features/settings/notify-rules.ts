// Pure rules behind Settings › Notifications (SCREENS.md §18, PRODUCT_SPEC.md
// §14): the lead-time choices and the words for when a nudge comes. The
// server derives the actual times (migration 20261006101100): the morning
// nudge at the start of the day's first work segment, the shutdown nudge 30
// minutes before the last one ends, unless a time is chosen here.
import type { Segment } from "./settings-rules";

/** "Remind me": at the start, or 5, 10 or 15 minutes before. */
export const BLOCK_LEADS = [0, 5, 10, 15] as const;

export function leadLabel(minutes: number): string {
  return minutes === 0 ? "At the start" : `${minutes} min before`;
}

/** The second line under a nudge's switch: when it comes. */
export function nudgeHint(kind: "morning" | "shutdown", time: string): string {
  if (time) return `At ${time}`;
  return kind === "morning" ? "At the start of my day" : "30 min before I finish";
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * The time "Choose a time" starts from: what the derived time is on the first working day of the week, so the
 * field opens on something familiar; 08:30 or 17:30 when there are no working hours.
 */
export function suggestedNudgeTime(kind: "morning" | "shutdown", week: readonly (readonly Segment[])[]): string {
  const day = week.find((segs) => segs.length > 0);
  if (!day) return kind === "morning" ? "08:30" : "17:30";
  if (kind === "morning") return day.reduce((min, s) => (s.start < min ? s.start : min), day[0].start);
  const end = day.reduce((max, s) => (s.end > max ? s.end : max), day[0].end);
  return hhmm(Math.max(0, minutes(end) - 30));
}
