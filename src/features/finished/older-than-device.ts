// Whether a past day is older than the week of finished tasks a device holds (DECISIONS.md, amendments 2026-11-14 and
// 2026-11-15). One rule for Today's past day on the web (features/today/day-states.tsx) and in the Android app, free
// of either's drawing (docs/mobile/ANDROID_APP_SPEC.md §4).

/**
 * How long a finished task stays in `tasks`, and so on the device: the nightly move files away what was finished
 * more than a week ago, to the instant (DECISIONS.md, amendment 2026-11-14).
 */
const KEPT_MS = 7 * 24 * 60 * 60_000;

/** A past day's two instants: its start, and the start of the day after. */
export type DayInstants = readonly [string, string];

/** Whether a past day began before the week the device holds, so that some or all of what was finished on it is only on the server. */
export function olderThanDevice(day: DayInstants | false | undefined, now: { epochMilliseconds: number }): day is DayInstants {
  return Boolean(day) && Date.parse((day as DayInstants)[0]) < now.epochMilliseconds - KEPT_MS;
}
