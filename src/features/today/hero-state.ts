// The hero's one state, alone: the rule for the words over the ribbon, with none of the ribbon's drawing
// (ribbon.tsx). Its own module so the week's readout (features/upcoming/week.ts) says what Today's hero says
// without carrying a web screen, and the Android app can use it as it is (docs/mobile/ANDROID_APP_SPEC.md §4).
import type { Capacity } from "@/core/capacity";
import { formatMinutes, formatTime, timeFromMinutes } from "@/core/time";

/** The hero's one state (ruling R3): the spare figure and a spill never share a card. */
export interface HeroState {
  /** True when the plan cannot fit: it spills past the end of the day, or it is already over the day's budget. */
  over: boolean;
  /** The figure the hero prints: what is spare, or how much is over. */
  min: number;
  /** One sentence naming the spill, when there is one: "~40m spills past 18:00". */
  spill: string | null;
  /** "done by 16:25" — only when the day finishes with nothing left over. */
  finish: string | null;
}

/**
 * Which state the hero is in, for both heroes at once. A plan that spills past
 * the end of the day is over even when the day's budget still looks generous —
 * which is what every evening looks like — so the amber sentence and the green
 * figure can never appear together (ruling R3). After the working day with
 * nothing over, the day's spare figure simply stands.
 */
export function heroState(c: Capacity): HeroState {
  const end = c.windows.length > 0 ? c.windows[c.windows.length - 1].end : 0;
  const spills = c.overflowMin > 0;
  return {
    over: spills || c.spareMin < 0,
    min: spills ? c.overflowMin : Math.abs(c.spareMin),
    spill: spills ? `~${formatMinutes(c.overflowMin)} spills past ${formatTime(timeFromMinutes(end))}` : null,
    finish: !spills && c.projectedFinish ? `done by ${formatTime(c.projectedFinish)}` : null,
  };
}
