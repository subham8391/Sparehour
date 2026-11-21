// What Settings' sections offer and say (SCREENS.md §18), apart from how they are drawn: the choices a control has,
// the bounds of a number, and the sentences under a row. Free of the web's screen parts, so the web's sections
// (sections/*.tsx) and the Android app's Settings offer and say the same things from one place
// (docs/mobile/ANDROID_APP_SPEC.md §4.3). A row's own name stays with the row that draws it.
import type { ExportFormat } from "@/core/export";
import { Temporal } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { MissPolicy } from "@/core/types";
import type { OpenTo } from "@/data/repositories/settings-repo";
import { segmentsLabel, type Segment } from "./settings-rules";
import type { MotionChoice, SettingsValues } from "./settings-values";

// ---- Account

/** Under "Signed in with" when the auth server cannot be reached. */
export const SIGN_IN_METHODS_OFFLINE = "Shown when you’re online";

/** The action beside the time zone when the device is somewhere else: "Detected Europe/London — use it". */
export const zoneOffer = (hint: string): string => `${hint} — use it`;

export const DELETE_ACCOUNT_NOTE = "Everything in your account goes, after 30 days to change your mind.";

// ---- Working hours

/** What a day's switch is called: "Monday is a working day". */
export const workingDayLabel = (day: string): string => `${day} is a working day`;

/** Said under a day whose overlapping stretches were joined when focus left it. */
export const joinedNote = (merged: readonly Segment[]): string => `Overlapping hours were joined: ${segmentsLabel(merged)}.`;

/** The buffer for the unexpected, in per cent of the working day (SCREENS.md §18: "buffer slider 0–30%"). */
export const BUFFER = { min: 0, max: 30, step: 5 } as const;

/** Under "Evening ends at" (PRODUCT_SPEC.md §9.1). */
export const EVENING_ENDS_HINT = "This Evening’s time runs from the end of your working hours until then.";

// ---- Notifications

export const QUIET_HOURS_HINT = "Anything due in these hours is dropped, not saved for the morning.";
export const BADGE_HINT = "Today’s remaining tasks, once reminders are allowed. It clears when you close the day.";
/** The section's last line (PRODUCT_SPEC.md §14 rule 6). */
export const NEVER_LATE = "Never a count of what’s late.";

// ---- Planning

/** A number row's bounds and the word after its field. */
export interface NumberBounds {
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const PLANNING_NUMBERS = {
  defaultEstimateMin: { unit: "minutes", min: 5, max: 480, step: 5 },
  carryAskAfter: { unit: "carries", min: 1, max: 14, step: 1 },
  autoSomedayDays: { unit: "days", min: 7, max: 120, step: 1 },
} as const satisfies Partial<Record<keyof SettingsValues, NumberBounds>>;

/** The sentence, up to the length, under the default estimate once finished tasks say otherwise (DECISIONS.md, amendment 2026-11-15). */
export const USUAL_UNESTIMATED = "Tasks you finished without an estimate usually took";

export const CARRY_REVIEW_HINT = "Ask about carried-over tasks when the day starts";

export const MISS: { value: MissPolicy; label: string }[] = [
  { value: "carry", label: "Carry" },
  { value: "skip", label: "Skip" },
  { value: "expire", label: "Expire" },
];

/** What each choice does, said under the control. */
export const MISS_HINT: Record<MissPolicy, string> = {
  carry: "A new task that misses its day moves to the next one.",
  skip: "A new task that misses its day loses its date and waits, undated.",
  expire: "A new task that misses its day goes to the Logbook, where it can come back.",
};

/** The whole line under "Default if missed": the choice's own sentence, then what repeats do whatever is chosen. */
export const missHint = (policy: MissPolicy): string => `${MISS_HINT[policy]} Repeating tasks skip.`;

export const OPEN_TO: { value: OpenTo; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "inbox", label: "Inbox" },
  { value: "upcoming", label: "Upcoming" },
];
export const OPEN_TO_HINT = "Where the app starts";

export const TODAY_SORT_HINT = "Manual keeps the order you set by hand; the others never change it.";
export const SHOW_COMPLETED_HINT = "Today’s finished tasks under a Done divider";

// ---- Appearance

export const LOOK_HINT = "Colours, type and shapes. Every look works the same; it follows you to every device.";

export const THEMES: readonly { value: SettingsValues["theme"]; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/** Reduce motion, this device's own choice: System follows the device's setting, Reduce cuts movement here. */
export const MOTIONS: readonly { value: MotionChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "reduce", label: "Reduce" },
];
export const motionHint = (choice: MotionChoice): string => (choice === "reduce" ? "Movement is cut on this device" : "Follows this device’s setting");

// ---- Data

export const EXPORT_FORMATS: readonly (readonly [ExportFormat, string])[] = [
  ["json", "JSON"],
  ["markdown", "Markdown"],
  ["csv", "CSV"],
];
export const EXPORT_HINT = "Tasks, checklists, projects, areas, tags, blocks, day plans and settings, from this device — no server needed.";
/** Under the export's buttons: what each format is. */
export const EXPORT_NOTE = "JSON is complete and re-importable. Markdown is one file per project, zipped. CSV is the flat task table.";

// ---- About

export const PRIVACY_HINT = "Where your data lives, and what leaves this device";

// ---- Connected apps (DECISIONS.md, amendment 2026-10-23)

/** One app the person has let in, as /api/connections answers. */
export interface ConnectedApp {
  clientId: string;
  name: string;
  access: "read" | "write";
  connectedAt: string | null;
}

export const ACCESS = [
  { value: "write", label: "Read and change" },
  { value: "read", label: "Read only" },
] as const;

/** "Connected Fri 23 Oct" under an app's name; null when the day is not known. */
export function connectedOn(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const day = Temporal.Instant.from(iso).toZonedDateTimeISO(Temporal.Now.timeZoneId()).toPlainDate();
    return `Connected ${formatDay(day, { today: Temporal.Now.plainDateISO() })}`;
  } catch {
    return null;
  }
}

export const CONNECTIONS = {
  /** Under the card. */
  note: "An app sees your tasks, projects and calendar busy times. Disconnecting stops it at once.",
  offline: "Connected apps need a connection to the internet.",
  connectHint: "In Claude, add a custom connector with this address, then sign in here when it asks.",
  unavailable: "Connecting apps isn’t switched on for this server yet.",
  none: "No apps connected yet.",
  accessLabel: (name: string): string => `What ${name} may do`,
  changeFailed: (name: string): string => `Couldn’t change what ${name} may do. Check your connection and try again.`,
  disconnectFailed: (name: string): string => `Couldn’t disconnect ${name}. Check your connection and try again.`,
} as const;
