// The first run's rules (ONBOARDING.md 1b and step 3), pure so they are unit-tested: the working week as the
// one-tap default or as edited, what stops it being saved and what is only noted, and how a brain-dump line
// lands (today unless it names its own day; the Inbox after the twentieth).
import type { TaskDraft } from "@/core/quickadd";
import type { LocalDate } from "@/core/time";
import { formatDay, weekdayName } from "@/core/time/format-day";
import { mergeSegments, segmentMinutes, segmentsLabel, type Segment } from "@/features/settings/settings-rules";
import { daysFromToday } from "@/ui/relative-day";

export type { Segment };

/** Monday first, as work_hours.weekday counts (0 = Monday). */
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/** The default every new account starts with: Mon–Fri, 09:00–18:00, weekends off (§1b). */
export const DEFAULT_HOURS: Segment = { start: "09:00", end: "18:00" };
export const DEFAULT_DAYS: readonly boolean[] = [true, true, true, true, true, false, false];

/** A segment longer than this is allowed, with a quiet note (§1b: "We do not police it"). */
export const LONG_DAY_MIN = 16 * 60;

/** The week strip: which days are on and the one pair of times they all share. */
export interface Strip {
  days: boolean[];
  hours: Segment;
}

/** The saved work_hours rows as a week, Monday first, each day's stretches in start order. */
export function weekFromRows(rows: readonly { weekday: number | null; start_time: string | null; end_time: string | null }[]): Segment[][] {
  const week: Segment[][] = [[], [], [], [], [], [], []];
  for (const r of rows) {
    if (r.weekday == null || r.weekday < 0 || r.weekday > 6 || !r.start_time || !r.end_time) continue;
    week[r.weekday].push({ start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) });
  }
  for (const day of week) day.sort((a, b) => a.start.localeCompare(b.start));
  return week;
}

/** The week the strip stands for: the shared pair on every day that is on, nothing on the rest. */
export function stripWeek(strip: Strip): Segment[][] {
  return strip.days.map((on) => (on ? [{ ...strip.hours }] : []));
}

/**
 * Where 1b starts from the saved week: the strip when every working day has the same single stretch (a new
 * account's Mon–Fri 09:00–18:00), else the per-day rows, which can say what the strip cannot. A week with no
 * working day at all starts from the default.
 */
export function startingHours(saved: readonly (readonly Segment[])[]): { strip: Strip; perDay: boolean } {
  const days = Array.from({ length: 7 }, (_, d) => (saved[d]?.length ?? 0) > 0);
  if (!days.some(Boolean)) return { strip: { days: [...DEFAULT_DAYS], hours: { ...DEFAULT_HOURS } }, perDay: false };
  const working = saved.filter((segs) => segs.length > 0);
  const labels = new Set(working.map((segs) => segmentsLabel(segs)));
  const uniform = labels.size === 1 && working[0].length === 1;
  return { strip: { days, hours: uniform ? { ...working[0][0] } : { ...DEFAULT_HOURS } }, perDay: !uniform };
}

/** What stops the week being saved (§1b validation), or null. */
export function hoursError(week: readonly (readonly Segment[])[]): string | null {
  if (!week.some((segs) => segs.length > 0)) return "Pick at least one working day.";
  const segments = week.flat();
  if (segments.some((s) => !/^\d{2}:\d{2}$/.test(s.start) || !/^\d{2}:\d{2}$/.test(s.end))) return "Use a time like 09:00.";
  if (segments.some((s) => segmentMinutes(s) === null)) return "End time is before the start.";
  return null;
}

/** "That's a long day" when any working day runs past 16 hours: said, never refused. */
export function hoursNote(week: readonly (readonly Segment[])[]): string | null {
  return week.some((segs) => mergeSegments(segs).some((s) => (segmentMinutes(s) ?? 0) > LONG_DAY_MIN)) ? "That's a long day." : null;
}

/** The week as it is saved: each day's stretches in order, overlapping or touching ones joined. */
export function settledWeek(week: readonly (readonly Segment[])[]): Segment[][] {
  return week.map((segs) => mergeSegments(segs));
}

/** The time zone the browser reports, or null when it will not say. */
export function detectedZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// ---- step 3, the brain dump

/** After this many, the quiet line shows and the rest go to the Inbox (§Step 3 validation, B5). */
export const BRAIN_DUMP_TODAY_LIMIT = 20;

export const PLENTY_LINE = "That's plenty for one day — the rest can live in your Inbox.";

/**
 * How the `index`-th line (0-based) of the brain dump is saved. A line that names no day of its own is for today,
 * active; one with a do-date or a start date keeps what the parser read. From the 21st on, the default stops and
 * an undated line goes to the Inbox like any quick-add.
 */
export function brainDumpDraft(draft: TaskDraft, today: LocalDate, index: number): TaskDraft {
  if (index >= BRAIN_DUMP_TODAY_LIMIT || draft.doDate || draft.startDate) return draft;
  return { ...draft, doDate: today };
}

/** "Friday — I'll keep it for then." for a line that named a day other than today; null otherwise. */
export function keptForThen(draft: TaskDraft, today: LocalDate): string | null {
  const day = draft.doDate ?? draft.startDate;
  if (!day || day.equals(today)) return null;
  const days = daysFromToday(day, today);
  const label = days === 1 ? "Tomorrow" : days > 1 && days < 7 ? weekdayName(day, "long") : formatDay(day, { today });
  return `${label} — I'll keep it for then.`;
}

/** The primary's label: "Next", then "Next — 5 things" once there are tasks. */
export function nextLabel(count: number): string {
  return count > 0 ? `Next — ${count} ${count === 1 ? "thing" : "things"}` : "Next";
}

/** The placeholder cycles through three examples, 2.5 s apart; one stays put for people who asked for less motion. */
export const PLACEHOLDERS = ["Draft the proposal 3pm ~45m", "Call the plumber", "Review PRs ~1h #work"] as const;
export const PLACEHOLDER_MS = 2500;
