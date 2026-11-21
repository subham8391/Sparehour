// The ribbon's words and the labels under it, alone: what the hero says when it is over, on a day without working
// hours, about blocks outside them, and which hour labels give way to a cursor's time. None of the ribbon's drawing
// (ribbon.tsx), so the Android app says and labels the day exactly as the web does (docs/mobile/ANDROID_APP_SPEC.md
// §4). ribbon.tsx hands every name on, so imports of them from the ribbon stay as they were.
import { formatMinutes, formatTime, timeFromMinutes } from "@/core/time";
import type { HeroState } from "./hero-state";

/** Hour labels this close to a cursor's time yield to it: 35 min is 49 px on a 760 px track, 32 px on a phone's. */
const YIELD_MIN = 35;
/** Below 340 px of track only every second hour is labelled and a cursor clears a wider berth. */
const YIELD_NARROW_MIN = 60;
/** The over-tail never takes more than this share of the card, so a wild overrun cannot squeeze the day to nothing. */
export const TAIL_MAX_PCT = 20;

/** How long the calendar may take before the ribbon says it is drawing working hours only (SCREENS.md §21). */
export const CALENDAR_PATIENCE_MS = 4000;

/** Over by more than this, the ribbon offers Trim today inline (PRODUCT_SPEC.md §9.4 "Well over"). */
export const WELL_OVER_MIN = 120;

/** The over state's one sentence: the spill (or the overage) and, when there is one, the suggested move. */
export function overSentence(h: Pick<HeroState, "min" | "spill">, suggestion?: string | null): string {
  return `${h.spill ?? `${formatMinutes(h.min)} more than fits`}${suggestion ? ` — move ${suggestion} to tomorrow` : ""}`;
}

/** "3 hours 20 minutes", for the live region: a screen reader reads "3h 20m" letter by letter in places. */
export function spokenMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const part = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (h === 0) return part(m, "minute");
  return m === 0 ? part(h, "hour") : `${part(h, "hour")} ${part(m, "minute")}`;
}

/**
 * SCREENS.md §2.2, non-working day: "No working hours today · 3 things planned"; an out-of-office day says so instead
 * (SYSTEM_DESIGN.md §5.4), and another day Today was stepped to is "that day".
 */
export function noWorkDayLine(planned: number | undefined, { outOfOffice = false, otherDay = false }: { outOfOffice?: boolean; otherDay?: boolean } = {}): string {
  const line = `${outOfOffice ? "Out of office" : "No working hours"} ${otherDay ? "that day" : "today"}`;
  return planned ? `${line} · ${planned} ${planned === 1 ? "thing" : "things"} planned` : line;
}

export interface RibbonLabel {
  min: number;
  text: string;
  kind: "hour" | "now" | "finish";
  /** `narrow` hides the label on a track under 340 px; `always` hides it because a cursor's time sits there. */
  hide: "never" | "narrow" | "always";
}

/** "1h planned outside working hours" (PRODUCT_SPEC.md §10.2). */
export const outsideHoursLine = (min: number) => `${formatMinutes(min)} planned outside working hours`;

/**
 * The labels under the ticks: every whole hour, the now time and the finish
 * time. Hour labels within YIELD_MIN of a cursor yield to it; on a narrow
 * track the odd hours go too, and the berth widens to YIELD_NARROW_MIN. When
 * the finish sits inside the now label's berth the now label wins, as the
 * finish is already named in the card's prose.
 */
export function ribbonLabels(day: number, end: number, nowMin?: number, finishMin?: number): RibbonLabel[] {
  const within = (m: number | undefined): m is number => m !== undefined && m >= day && m <= end;
  const now = within(nowMin) ? nowMin : undefined;
  const finishShown = within(finishMin) && (now === undefined || Math.abs(finishMin - now) >= YIELD_MIN);
  const finish = finishShown ? finishMin : undefined;
  const cursors = [now, finish].filter((m): m is number => m !== undefined);
  const near = (h: number, berth: number) => cursors.some((m) => Math.abs(h - m) < berth);
  const labels: RibbonLabel[] = [];
  const firstHour = Math.ceil(day / 60) * 60;
  for (let h = firstHour, i = 0; h <= end; h += 60, i++) {
    const hide = near(h, YIELD_MIN) ? "always" : i % 2 === 1 || near(h, YIELD_NARROW_MIN) ? "narrow" : "never";
    labels.push({ min: h, text: formatTime(timeFromMinutes(h)).slice(0, 2), kind: "hour", hide });
  }
  if (now !== undefined) labels.push({ min: now, text: formatTime(timeFromMinutes(now)), kind: "now", hide: "never" });
  if (finish !== undefined) labels.push({ min: finish, text: formatTime(timeFromMinutes(finish)), kind: "finish", hide: now !== undefined && Math.abs(finish - now) < YIELD_NARROW_MIN ? "narrow" : "never" });
  return labels;
}
