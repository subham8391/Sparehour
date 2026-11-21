// An account and a calendar as Settings › Calendar reads them from the synced rows (SCREENS.md §18), and what it
// says once a Disconnect is answered. Free of the web's screen parts and small on purpose: the web's hook
// (use-calendar.ts, in the Settings shell) and the Android app's Calendar section read the rows the same way
// (docs/mobile/ANDROID_APP_SPEC.md §4.3). The panel's other words are in calendar-words.ts.
import type { CalendarConnectionRow, CalendarFullRow } from "@/data/queries/calendar";
import type { CalendarProviderId } from "./providers";

export interface CalendarAccountView {
  id: string;
  provider: CalendarProviderId;
  email: string | null;
  status: "ok" | "needs_reauth" | "revoked";
  lastSyncedAt: string | null;
  lastError: string | null;
  canWrite: boolean;
  /** Full access: events come with titles. Otherwise busy times only. */
  titles: boolean;
  /** Blocks may go to any calendar the person owns; otherwise only to the app-created "Sparehour" calendar. */
  writesOwn: boolean;
}

export interface CalendarView {
  id: string;
  accountId: string | null;
  summary: string;
  color: string | null;
  accessRole: string | null;
  read: boolean;
  private: boolean;
  writeTarget: boolean;
}

export const toAccountView = (r: CalendarConnectionRow): CalendarAccountView => ({
  id: r.id,
  // Anything but Outlook is Google, which came first (providers.ts says the same for the islands).
  provider: r.provider === "microsoft" ? "microsoft" : "google",
  email: r.email,
  status: r.status === "needs_reauth" || r.status === "revoked" ? r.status : "ok",
  lastSyncedAt: r.last_synced_at,
  lastError: r.last_error,
  canWrite: r.can_write === 1,
  titles: r.can_read_titles === 1,
  writesOwn: r.can_write_own === 1,
});

export const toCalendarView = (r: CalendarFullRow): CalendarView => ({
  id: r.id,
  accountId: r.calendar_account_id,
  summary: r.summary ?? "Untitled calendar",
  color: r.color,
  accessRole: r.access_role,
  read: r.read !== 0,
  private: r.private === 1,
  writeTarget: r.write_target === 1,
});

/** What the panel says once the server has answered a Disconnect. */
export const disconnectNotice = (ok: boolean): string => (ok ? "Disconnected. Your blocks stay, unsynced." : "Couldn't disconnect just now.");
