// What Today's hero card says, worked out from the shared capacity engine's own result (../../../src/core/capacity)
// by the web hero's own rule and words (../../../src/features/today/hero-state.ts, ribbon-words.ts; the web draws them
// in ribbon.tsx). No sum is redone here: every figure is one the engine gave. Its own file, free of the screen, so it
// is tested plainly.
import type { Capacity } from "@/core/capacity";
import { formatMinutes } from "@/core/time";
import { heroState } from "@/features/today/hero-state";
import { WELL_OVER_MIN, noWorkDayLine, outsideHoursLine, overSentence, spokenMinutes } from "@/features/today/ribbon-words";

export type Summary =
  | { kind: "none"; line: string }
  | {
      kind: "spare" | "over";
      /** The figure, already in words: "6h 05m". */
      figure: string;
      /** For a screen reader, which reads "3h 20m" letter by letter in places: "3 hours 20 minutes spare". */
      spoken: string;
      /** Nothing spare and nothing over: the figure is drawn a step quieter. */
      level: boolean;
      /** "2h 35m planned", or "nothing planned yet". */
      planned: string;
      /** "1h in meetings"; without a calendar, the way to get one; "calendar still loading" while it is late. */
      meetings: { kind: "minutes" | "connect" | "loading"; text: string };
      /** "done by 16:25", when the day finishes with nothing left over. */
      finish: string | null;
      /** An empty today offers the morning plan: "Plan your day". */
      planLink: boolean;
      /** The over state's one sentence, with the suggested move when there is one; it opens Trim today where that is offered. */
      over: string | null;
      /** "1h planned outside working hours" */
      outside: string | null;
      /** Over by more than two hours: "2h 30m more than fits — want help trimming?" */
      wellOver: string | null;
      /** Everything beside the figure as one line, as it reads: "2h 35m planned · 1h in meetings · done by 16:25". */
      line: string;
    };

export interface SummaryOptions {
  /** False without a calendar (PRODUCT_SPEC.md §9.4): the meetings line becomes the way to get one. */
  connected?: boolean;
  /** How many things are on the day, for the non-working-day line. */
  plannedCount?: number;
  /** Something was finished today: a day with nothing left is all done, not "nothing planned yet". */
  finished?: boolean;
  /** Today stepped to another day: its words drop "today" and it offers no morning plan. */
  otherDay?: boolean;
  /** The calendar is connected, and its events have been late for long enough to say so (CALENDAR_PATIENCE_MS). */
  calendarLate?: boolean;
  /** Trim today is offered (today only): the over sentence is said even without a spill, and names the suggested move. */
  trim?: boolean;
  /** The one suggested move when over, a task's title. */
  suggestion?: string | null;
}

export function todaySummary(cap: Capacity | null, o: SummaryOptions = {}): Summary {
  if (cap === null) return { kind: "none", line: "" };
  if (cap.state === "no_work_day") return { kind: "none", line: noWorkDayLine(o.plannedCount, { outOfOffice: cap.reason === "out_of_office", otherDay: o.otherDay }) };
  // Spare or over, and by how much: the web hero's own rule (a plan that spills past the day's end is over even when
  // the budget still looks generous), so Today, the Week tab and the web all say the same thing.
  const hero = heroState(cap);
  const plannedMin = cap.committedMin + cap.unscheduledMin;
  // Nothing planned yet (PRODUCT_SPEC.md §9.4 "Empty"): the line says so and invites the morning plan.
  const empty = plannedMin === 0 && !o.finished;
  const planned = empty ? "nothing planned yet" : `${formatMinutes(plannedMin)} planned`;
  const connected = o.connected !== false;
  const meetings: { kind: "minutes" | "connect" | "loading"; text: string } =
    o.calendarLate && connected ? { kind: "loading", text: "calendar still loading" } : connected ? { kind: "minutes", text: `${formatMinutes(cap.busyMin)} in meetings` } : { kind: "connect", text: "connect a calendar to see real free time" };
  const planLink = empty && !o.otherDay;
  // One of the two, never both: the day either finishes or it spills (ruling R3).
  const over = hero.over && (hero.spill || o.trim) ? (o.trim ? overSentence(hero, o.suggestion) : hero.spill) : null;
  return {
    kind: hero.over ? "over" : "spare",
    figure: formatMinutes(hero.min),
    spoken: `${spokenMinutes(hero.min)} ${hero.over ? "over" : "spare"}`,
    level: !hero.over && cap.spareMin === 0,
    planned,
    meetings,
    finish: hero.finish,
    planLink,
    over,
    outside: cap.outsideHoursMin > 0 ? outsideHoursLine(cap.outsideHoursMin) : null,
    wellOver: o.trim && hero.over && hero.min > WELL_OVER_MIN ? `${formatMinutes(hero.min)} more than fits — want help trimming?` : null,
    line: [planned, meetings.text, hero.finish, planLink ? "Plan your day" : null, over].filter((part): part is string => Boolean(part)).join(" · "),
  };
}
