// Settings' sections (SCREENS.md §18): their order, their names in the URL
// (/settings#calendar), and the one-line summary each shows in the phone's
// section list. Pure, so the order, the parsing and the words are tested.
import type { MotionChoice } from "./motion";
import { hoursSummary, type Segment } from "./settings-rules";
import type { SettingsValues } from "./types";

export type SectionKey = "account" | "working-hours" | "calendar" | "notifications" | "planning" | "appearance" | "data" | "app";

export interface SectionMeta {
  key: SectionKey;
  title: string;
}

export const SECTIONS: readonly SectionMeta[] = [
  { key: "account", title: "Account" },
  { key: "working-hours", title: "Working hours" },
  { key: "calendar", title: "Calendar" },
  { key: "notifications", title: "Notifications" },
  { key: "planning", title: "Planning" },
  { key: "appearance", title: "Appearance" },
  { key: "data", title: "Data" },
  { key: "app", title: "App" },
];

/** The section a hash names ("#calendar"), or null for the list; unknown names are the list too. */
export function parseSection(hash: string): SectionKey | null {
  const key = decodeURIComponent(hash.replace(/^#/, ""));
  return SECTIONS.some((s) => s.key === key) ? (key as SectionKey) : null;
}

export function sectionTitle(key: SectionKey): string {
  return SECTIONS.find((s) => s.key === key)?.title ?? "Settings";
}

export interface SummaryInput {
  values: SettingsValues;
  workHours: readonly (readonly Segment[])[];
  email: string | null;
  /** Calendars connected and how many count as busy; null while unknown. */
  calendars: { accounts: number; busy: number } | null;
  /** Whether this device receives reminders; null where it cannot tell. */
  subscribed: boolean | null;
  motion: MotionChoice;
  version: string | null;
}

const THEME = { light: "Light", dark: "Dark", system: "System theme" } as const;
const MISS = { carry: "carry", skip: "skip", expire: "expire" } as const;
const OPEN = { today: "Today", inbox: "Inbox", upcoming: "Upcoming" } as const;

/** The line under a section's name on the phone: "Working hours · Mon–Fri · 09:00–18:00" shows the second half. */
export function sectionSummary(key: SectionKey, s: SummaryInput): string {
  const v = s.values;
  switch (key) {
    case "account":
      return [s.email, v.timezone].filter(Boolean).join(" · ");
    case "working-hours":
      return `${hoursSummary(s.workHours)} · buffer ${v.bufferPct}%`;
    case "calendar":
      if (!s.calendars) return "Connected calendars";
      if (s.calendars.accounts === 0) return "Not connected";
      return `${s.calendars.accounts === 1 ? "1 account" : `${s.calendars.accounts} accounts`} · ${s.calendars.busy} counted as busy`;
    case "notifications": {
      const device = s.subscribed === null ? null : s.subscribed ? "On for this device" : "Off on this device";
      const quiet = v.quietHoursStart && v.quietHoursEnd ? `quiet ${v.quietHoursStart}–${v.quietHoursEnd}` : null;
      return [device, quiet].filter(Boolean).join(" · ") || "Reminders and quiet hours";
    }
    case "planning":
      return `Ask after ${v.carryAskAfter} carries · missed tasks ${MISS[v.defaultMissPolicy]} · opens to ${OPEN[v.defaultView]}`;
    case "appearance":
      return [THEME[v.theme], s.motion === "reduce" ? "reduced motion" : null].filter(Boolean).join(" · ");
    case "data":
      return "Export JSON · Markdown · CSV";
    case "app":
      return s.version ? `Install, storage · version ${s.version}` : "Install and storage";
  }
}
