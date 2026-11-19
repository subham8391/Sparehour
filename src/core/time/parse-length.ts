// A length of time as a person types it into the estimate box (DECISIONS.md, amendment 2026-11-19). Kept out of
// `core/time`'s index, which every shell carries: only the estimate picker's island imports this.

/** The longest a task may be estimated at: a day (`tasks.estimate_min` is checked between 1 and 1440). */
export const MAX_LENGTH_MIN = 24 * 60;

const HOURS = "(?:h|hr|hrs|hour|hours)";
const MINUTES = "(?:m|min|mins|minute|minutes)";
const WORDS = new RegExp(`^(?:(\\d+(?:[.,]\\d+)?)\\s*${HOURS})?\\s*(?:(\\d+)\\s*${MINUTES}?)?$`);
const CLOCK = /^(\d{1,2}):([0-5]\d)$/;

/**
 * "150", "90m", "2h", "2h 30m", "2h30", "1.5h", "2:30" → minutes. A bare number is minutes. Null for nothing, for
 * anything else, for no time at all and for more than a day.
 */
export function parseLength(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const clock = CLOCK.exec(t);
  const words = clock ? null : WORDS.exec(t);
  if (!clock && !words) return null;
  const hours = clock ? Number(clock[1]) : Number((words?.[1] ?? "0").replace(",", "."));
  const minutes = Number(clock ? clock[2] : (words?.[2] ?? "0"));
  const total = Math.round(hours * 60) + minutes;
  return total >= 1 && total <= MAX_LENGTH_MIN ? total : null;
}
