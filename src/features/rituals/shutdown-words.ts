// What the evening shutdown's flow says and offers beyond its sums (SCREENS.md §15): each step's title, the fixed
// lines and button names, which answers a row of step 2 still offers, and when a typed highlight is saved. Free of
// the web's screen parts, so the web's flow (shutdown-flow.tsx) and the Android app's ask the same things in the same
// words (docs/mobile/ANDROID_APP_SPEC.md §4.3). The sums and the sentences built from them are shutdown.ts.
import { SHUTDOWN_STEPS, type CarryChoice, type CarryOutcome, type ShutdownStep } from "./shutdown";

/** Each step's title, which is also its name in the step strip. */
export const SHUTDOWN_TITLES: Record<ShutdownStep, string> = {
  done: "Done today",
  carried: "Carried to tomorrow",
  rating: "How was the day?",
  highlight: "What was worth it today?",
  tomorrow: "Tomorrow",
  close: "Close the day",
};
export const SHUTDOWN_LABELS: readonly string[] = SHUTDOWN_STEPS.map((s) => SHUTDOWN_TITLES[s]);

export const SHUTDOWN_WORDS = {
  /** Before "· 2 of 6" over the title. */
  eyebrow: "Evening shutdown",
  next: "Next",
  /** Step 2, while a row still waits. */
  carryNote: "Anything you leave here carries to tomorrow on its own.",
  carryAll: "Move all to tomorrow",
  /** Step 3. */
  ratingLead: "One tap. Skip if you’d rather not.",
  ratingGroup: "Day rating",
  /** Step 4. */
  highlightLabel: "Highlight",
  highlightHint: "One line is plenty.",
  /** Step 5. */
  planNow: "Plan tomorrow now",
  planMorning: "Plan it in the morning",
  /** Step 6. */
  closeLead: "That’s the day. Nothing is waiting for you.",
  close: "Close the day",
} as const;

/** What each answer of a step 2 row is called, in the order they are offered (SCREENS.md §15). */
export const CARRY_CHOICE_LABEL: Record<CarryChoice, string> = {
  tomorrow: "Tomorrow",
  someday: "Someday",
  drop: "Drop",
  keep: "Keep for today",
};

/** What one of the five rating buttons is called. */
export const rateLabel = (n: number): string => `Rate ${n}`;

/** How many of today's completions step 4 offers as one-tap highlights. */
export const HIGHLIGHT_PICKS = 6;

/**
 * The answers a row of step 2 still offers. A waiting row has all four; "Kept for today" wrote nothing, so the three
 * moves stay open; any other outcome is settled (the toast's Undo is the way back).
 */
export function carryAnswers(outcome: CarryOutcome | null): readonly CarryChoice[] {
  if (outcome === null) return ["tomorrow", "someday", "drop", "keep"];
  if (outcome === "kept") return ["tomorrow", "someday", "drop"];
  return [];
}

/** How many rows of step 2 still wait for an answer; the note and "Move all to tomorrow" show while any does. */
export function waitingCount(rows: readonly { outcome: CarryOutcome | null }[]): number {
  return rows.filter((r) => r.outcome === null).length;
}

/** The highlight to save when the field is left or the step moves on: the typed line, trimmed; null when it says what is saved already. */
export function highlightToSave(typed: string, saved: string): string | null {
  return typed.trim() !== saved.trim() ? typed.trim() : null;
}
