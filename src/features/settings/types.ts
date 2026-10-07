// What Settings' sections receive (SCREENS.md §18): the saved values, this
// device's panels, and the callbacks that write. Presentational sections:
// values in, patches out; the page owns the data and the undo.
import type { ExportFormat } from "@/core/export";
import type { TodaySort } from "@/core/today/sort-options";
import type { MissPolicy } from "@/core/types";
import type { OpenTo, SettingsPatch } from "@/data/repositories/settings-repo";
import type { CalendarPanel } from "@/features/calendar/calendar-section";
import type { PermissionCopy } from "@/features/notifications/push";
import type { InstallState, PersistenceState } from "@/features/pwa/install";
import type { MotionChoice } from "./motion";
import type { Segment } from "./settings-rules";

export interface SettingsValues {
  timezone: string;
  weekStart: number;
  dayRolloverHour: number;
  bufferPct: number;
  defaultEstimateMin: number;
  carryAskAfter: number;
  autoSomedayDays: number;
  /** The morning review of carried-over tasks on the first open of a new day. */
  carryReview: boolean;
  eveningStartsAt: string;
  eveningEndsAt: string;
  theme: "system" | "light" | "dark";
  notifyBlockStart: boolean;
  notifyDeadline: boolean;
  notifyMorning: boolean;
  notifyShutdown: boolean;
  /** "HH:MM" when a time was chosen; empty for the time derived from working hours. */
  morningNudgeTime: string;
  shutdownNudgeTime: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  /** Minutes before a block's start its reminder fires: 0, 5, 10 or 15. */
  blockStartLeadMin: number;
  badgeEnabled: boolean;
  defaultMissPolicy: MissPolicy;
  defaultView: OpenTo;
  /** Today's sort, as its ⋯ menu sets it (SCREENS.md §18 Planning "sort defaults"). */
  todaySort: TodaySort;
  /** Today's Show completed. */
  showCompleted: boolean;
}

/** This device's push state (SYSTEM_DESIGN.md §7.3), owned by the page. */
export interface NotificationsPanel {
  copy: PermissionCopy;
  subscribed: boolean;
  busy: boolean;
  error: string | null;
  onEnable: () => void;
  onDisable: () => void;
  onTest: () => void;
  testResult: string | null;
}

export interface SettingsFormProps {
  values: SettingsValues;
  /** Each weekday's segments in start order (0 = Monday); an empty list is a day off. */
  workHours: readonly (readonly Segment[])[];
  detectedTimeZone: string | null;
  /** Who is signed in; `avatarUrl` is the provider's picture (users.avatar_url), and the initials stand in without one. */
  account: { name: string | null; email: string | null; avatarUrl?: string | null };
  /** The sign-in methods linked to the account ("Google", "Email code"), asked of the auth server when Account opens; omitted outside the app shell. */
  signInMethods?: () => Promise<string[]>;
  /** Install and storage state (SYSTEM_DESIGN.md §10.4–10.5); omitted outside the app shell. */
  app?: { install: InstallState; persistence: PersistenceState; version: string; onInstall: () => void };
  /** Push state for this device; omitted where there is no browser. */
  notifications?: NotificationsPanel;
  /** Connected calendars (SCREENS.md §18); omitted outside the app shell. */
  calendar?: CalendarPanel;
  /** One-click export (PRODUCT_SPEC.md §19.1); omitted outside the app shell. */
  data?: { onExport: (format: ExportFormat) => void; busy: ExportFormat | null; error: string | null; lastFile: string | null };
  /** Reduce motion, kept on this device like the theme; omitted outside the app shell. */
  motion?: { value: MotionChoice; onChange: (m: MotionChoice) => void };
  onChange: (patch: SettingsPatch) => void;
  /** Replaces a weekday's segments in one step; an empty list makes it a day off. */
  onWorkHours: (weekday: number, segments: Segment[]) => void;
  onSignOut: () => void;
  signingOut?: boolean;
  /** Changes that have not reached the account yet, when signing out would lose them; null when there are none. */
  unsynced?: number | null;
  onSignOutAnyway?: () => void;
  onStaySignedIn?: () => void;
}
