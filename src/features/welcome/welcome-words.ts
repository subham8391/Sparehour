// What the first run says (ONBOARDING.md 1b, step 2 and step 3), apart from how it is drawn: each step's question, its
// one sentence, its buttons and its notes. Its own module, free of the web's screen parts (hours-step.tsx,
// calendar-step.tsx and brain-dump.tsx draw them in the browser), so the Android app's first run says the same things
// in the same words (docs/mobile/ANDROID_APP_SPEC.md §4.3).

/** Why a write did not happen, after the sentence that names it. */
const reason = (e: unknown) => (e instanceof Error && e.message ? e.message : "try again.");

// ---- step 1b, the working hours

export const HOURS_WORDS = {
  title: "When do you work?",
  lead: "This is how we know what's left. You can change it any time.",
  edit: "Edit my hours",
  confirm: "That’s right",
  /** The strip of seven day pills, for a screen reader. */
  days: "Working days",
  start: "Start",
  end: "End",
  /** "Times are in Europe/London." */
  zoneLead: "Times are in",
  changeZone: "Change",
  zone: "Time zone",
  off: "Off",
  addHours: "Add hours",
  /** The label of the one undo that puts the zone and the week back. */
  undo: "Set your working hours",
} as const;

export const couldNotSaveHours = (e: unknown) => `Couldn't save your hours: ${reason(e)}`;

// ---- step 2, the calendar

/** What the consent's answer was, when it was not a connection (api/calendar/{google,microsoft}/callback). */
export type CalendarOutcome = "denied" | "error" | "no_read";

/** The one line said above the buttons after a connection that did not happen; the buttons stay (§2 Validation). */
export function outcomeNote(outcome: CalendarOutcome, reason: string | null): string {
  if (outcome === "denied") return "No problem. You can connect later from Settings.";
  if (outcome === "no_read") return "Google didn't share your busy times, so nothing was connected. Try again, or skip for now.";
  return reason?.trim() || "Google didn't answer. Try again.";
}

export interface CalendarPromise {
  lead: string;
  rest: string;
}

const PROMISES: readonly CalendarPromise[] = [
  { lead: "We read when you're busy.", rest: "Only the times, so the spare-time number is real." },
  { lead: "We don't see what your meetings are.", rest: "No titles, no guests, no notes." },
  { lead: "We don't change anything.", rest: "Nothing is added, moved or deleted." },
];

/**
 * The second line where Outlook is offered. Microsoft has no permission for busy times alone: the one it has lets an
 * app read a meeting's name, so "we don't see" would not be true of it. What is true of both is what is kept.
 */
const KEPT: CalendarPromise = { lead: "We keep only the times.", rest: "No titles, no guests, no notes." };

/** The three things promised, as they hold for the calendars on offer. */
export const calendarPromises = (outlook: boolean): readonly CalendarPromise[] => (outlook ? [PROMISES[0], KEPT, PROMISES[2]] : PROMISES);

export const CALENDAR_WORDS = {
  title: "Connect your calendar.",
  lead: "Your meetings are the reason you don't have as much time as you think. We subtract them.",
  skip: "Skip for now",
  outlook: "Connect Outlook",
  google: "Connect Google Calendar",
  /** Said under the three promises where Outlook is offered. */
  outlookAsk: "With Outlook, Microsoft’s screen asks to let Sparehour read your calendars. It has no narrower permission to ask for; the times are all we keep.",
  without: "Without it, the number uses your working hours alone.",
  privacy: "What we store, in plain English",
} as const;

/**
 * What can be added later, said after "Without it…". The later choices are Google's: nothing more can be asked of
 * Outlook yet, so nothing more is promised of it. Empty where Google is not offered.
 */
export function laterInSettings(google: boolean, outlook: boolean): string {
  if (!google) return "";
  return outlook ? " With Google Calendar, meeting names and time blocks on your calendar are yours to add later in Settings." : " Meeting names, and time blocks on your calendar, are yours to add later in Settings.";
}

// ---- step 3, the brain dump

export const BRAIN_DUMP_WORDS = {
  title: "What's on your plate today?",
  lead: "One per line. Don't organise anything — just get it out.",
  later: "I’ll add things later",
  /** The rows above the box, for a screen reader. */
  list: "On your plate",
} as const;

/** The line under the box until there is something to restate: "Try 3pm, ~45m, #project, !1 — we'll pick them up as you type." */
export const HINT = { before: "Try ", tokens: ["3pm", "~45m", "#project", "!1"], after: " — we’ll pick them up as you type." } as const;

/** A paste's entry on the undo stack: "4 tasks added". */
export const pastedLabel = (count: number) => `${count} ${count === 1 ? "task" : "tasks"} added`;

export const couldNotFinish = (e: unknown) => `Couldn't finish: ${reason(e)}`;

/** A step that is still opening. */
export const OPENING = "Opening…";
