// What the read-only view of an older finished task says about it (finished-peek.tsx), alone: when it was finished
// and the line of facts under that, with none of the view's screen parts, so the Android app's view of the same row
// reads the same (docs/mobile/ANDROID_APP_SPEC.md §4.3). finished-peek.tsx hands `finishedWhen` on, so the web's
// imports are unchanged.
import { formatMinutes, formatTime, instant, localDate, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { normaliseTimestamp } from "@/data/mappers";
import type { FinishedRow } from "./finished";

/** How long a delete may go unanswered before the view says it could not: a request that hangs must still end. */
export const DELETE_WAIT_MS = 20_000;

/** "Tuesday 3 March · 14:05", in the person's zone; the year when it is not this one. */
export function finishedWhen(completedAt: string | null, zone: string, today?: LocalDate): string | null {
  if (!completedAt) return null;
  const at = instant(normaliseTimestamp(completedAt)).toZonedDateTimeISO(zone);
  return `${formatDay(at.toPlainDate(), { weekday: "long", month: "long", today })} · ${formatTime(at.toPlainTime())}`;
}

/** How many older matches search asks the server for at a time. */
export const OLDER_FOUND_PAGE = 20;

/** The day a row was finished, in the person's zone, as a list says it: "Tue 3 Mar", with the year when it is another one. */
export function finishedDay(completedAt: string | null, zone: string, today?: LocalDate): string | null {
  if (!completedAt) return null;
  return formatDay(instant(normaliseTimestamp(completedAt)).toZonedDateTimeISO(zone).toPlainDate(), { today });
}

/** Where it was filed, its estimate, what it took and its deadline, as the one line under when it was finished. */
export function finishedFacts(row: Pick<FinishedRow, "estimate_min" | "actual_min" | "deadline">, projectName: string | null | undefined, today?: LocalDate): string[] {
  return [projectName, row.estimate_min ? formatMinutes(row.estimate_min) : null, row.actual_min ? `took ${formatMinutes(row.actual_min)}` : null, row.deadline ? `due ${formatDay(localDate(String(row.deadline).slice(0, 10)), { today })}` : null].filter((fact): fact is string => Boolean(fact));
}
