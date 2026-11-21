// What Settings › Calendar says (SCREENS.md §18, PRODUCT_SPEC.md §10.1), apart from how it is drawn: the
// read-all/write-one promise, an account's status line, and the words around Disconnect and the write calendar.
// Free of the web's screen parts, so the web's panel (calendar-section.tsx) and the Android app's say the same
// things from one place (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import { APP_CALENDAR } from "./blocks-go";
import type { CalendarAccountView, CalendarView } from "./calendar-views";

export const PROMISE = {
  read: "We read all your calendars — just the times you're busy, so the spare-hours number is real.",
  write: "We write to one calendar only: the one you pick here. Your time blocks go there and nowhere else.",
  /** Said where Outlook is offered: what is kept of it. */
  outlookRead: "From Outlook we keep only the times you're busy.",
  /** Said where Outlook is offered, and under the write calendar once it is connected: why none of its calendars is there. */
  outlookWrite: "Sparehour can't put blocks in Outlook yet.",
};

/** "just now", "12s ago", "5m ago", "3h ago", else the date. */
export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "not yet";
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** The line under an account: "Connected · busy times only · synced 12s ago", or what is wrong with it. */
export function accountStatusLine(a: Pick<CalendarAccountView, "status" | "titles" | "lastSyncedAt">, now: Date = new Date()): string {
  if (a.status === "ok") return `Connected${a.titles ? "" : " · busy times only"} · ${a.lastSyncedAt ? `synced ${relativeTime(a.lastSyncedAt, now)}` : "waiting for the first sync"}`;
  return a.status === "needs_reauth" ? "Needs reconnecting — your meetings stopped updating." : "Access was revoked.";
}

/** Said before Disconnect is pressed a second time: what it leaves. */
export const DISCONNECT_KEEPS = "Your blocks stay, unsynced.";

/** A calendar as "Blocks go to" names it: the app's own calendar is named for what it is. */
export const writeCalendarLabel = (c: Pick<CalendarView, "summary">): string => (c.summary === APP_CALENDAR ? "The Sparehour calendar in your Google Calendar" : c.summary);

/** The last choice under "Blocks go to": none. */
export const BLOCKS_STAY = "Keep blocks in Sparehour only";
