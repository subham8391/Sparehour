// What Settings' sections receive (SCREENS.md §18): the saved values, this
// device's panels, and the callbacks that write. Presentational sections:
// values in, patches out; the page owns the data and the undo.
import type { ExportFormat } from "@/core/export";
import type { SettingsPatch } from "@/data/repositories/settings-repo";
import type { CalendarPanelState } from "@/features/calendar/calendar-section";
import type { PermissionCopy } from "@/features/notifications/push";
import type { InstallState, PersistenceState } from "@/features/pwa/install";
import type { MotionChoice } from "./motion";
import type { Segment } from "./settings-rules";
import type { SettingsValues } from "./settings-values";

// The values themselves are in settings-values.ts, free of the web's screen parts: the Android app reads them too.
export type { SettingsValues };

/** This device's push state (SYSTEM_DESIGN.md §7.3), owned by the page. */
export interface NotificationsPanel {
  copy: PermissionCopy;
  subscribed: boolean;
  busy: boolean;
  error: string | null;
  onEnable: () => void;
  onDisable: () => void;
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
  calendar?: CalendarPanelState;
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
