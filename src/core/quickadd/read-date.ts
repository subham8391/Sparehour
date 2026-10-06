// A date typed into a field ("next tue", "21 oct", "in 3 days", "fri 3pm"):
// the task detail's Do, Deadline and Starts popovers (SCREENS.md §10). It is
// read exactly as quick-add would read those words after a title, so the two
// never disagree — today or tomorrow for a bare time (A10), `tonight` and
// `evening` as this evening — and anything that is not all date and time is
// not a date.
import type { LocalDate, LocalTime } from "../time";
import { parse } from "./parse";
import type { ParseContext } from "./types";

export interface TypedDate {
  date: LocalDate;
  time: LocalTime | null;
  evening: boolean;
}

/** A stand-in title, so the words are read the way quick-add reads them after one. */
const TITLE = "_";

export function readTypedDate(text: string, ctx: ParseContext): TypedDate | null {
  const words = text.trim();
  if (!words || words.includes("\n")) return null;
  const r = parse(`${TITLE} ${words}`, ctx);
  if (!r.ok || r.draft.title !== TITLE || !r.draft.doDate) return null;
  if (r.spans.some((s) => s.kind !== "datetime" && s.kind !== "evening")) return null;
  return { date: r.draft.doDate, time: r.draft.doTime, evening: r.draft.evening };
}
