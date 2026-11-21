// What Settings › Calendar offers about connecting, and in which words (SCREENS.md §18; DECISIONS.md, amendments
// 2026-10-21 and 2026-11-15): which provider's button is drawn and when it can be pressed, when showing blocks in
// Google Calendar and full access are offered, and every sentence around them. Free of the web's screen parts and of
// how a consent is reached (the web leaves the page for it, the Android app opens the system browser), so the web's
// panel (calendar-section.tsx) and the Android app's offer the same things in the same words
// (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import type { CalendarAccountView } from "./calendar-views";
import { PROVIDER_NAME, type CalendarProviderId } from "./providers";

/** What the server said it can connect. */
export interface ConnectAbility {
  /** Whether the server can connect Google; null while it is still being asked. */
  configured: boolean | null;
  /** True only once the server has said it can connect Outlook. */
  outlook: boolean;
}

/** Both providers, in the order their buttons are drawn. */
export const CONNECT_PROVIDERS: readonly CalendarProviderId[] = ["google", "microsoft"];

/** Whether a provider's button is drawn at all: Outlook only where the server can connect it; Google's stays (disabled while the server is still being asked) unless only Outlook can be connected, where it would lead nowhere. */
export const offersProvider = (provider: CalendarProviderId, s: ConnectAbility): boolean => (provider === "google" ? !(s.outlook && s.configured === false) : s.outlook);

/** Whether a new account of this provider can be connected now. */
export const canConnect = (provider: CalendarProviderId, s: ConnectAbility): boolean => (provider === "microsoft" ? s.outlook : s.configured === true);

/** Whether an account that stopped working can be reconnected: Google's button waits only for a server that said no. */
export const canReconnect = (provider: CalendarProviderId, s: ConnectAbility): boolean => (provider === "microsoft" ? s.outlook : s.configured !== false);

const has = (accounts: readonly Pick<CalendarAccountView, "provider">[], provider: CalendarProviderId): boolean => accounts.some((a) => a.provider === provider);

/** Showing blocks is Google's own step, offered once a Google account is connected and no account writes yet. */
export const offersShowBlocks = (accounts: readonly Pick<CalendarAccountView, "provider" | "canWrite">[]): boolean => !accounts.some((a) => a.canWrite) && has(accounts, "google");

/**
 * Full access is Google's (titles, blocks on the person's own calendars): offered while any working Google account
 * reads busy times only or keeps blocks to its own calendar.
 */
export const offersFullAccess = (accounts: readonly Pick<CalendarAccountView, "provider" | "status" | "titles" | "writesOwn">[]): boolean =>
  accounts.some((a) => a.provider === "google" && a.status === "ok" && (!a.titles || !a.writesOwn));

export const CONNECT = {
  /** Over the promise, with nothing connected yet. */
  title: "Connect your calendar.",
  google: "Connect Google Calendar",
  outlook: "Connect Outlook",
  /** Beside Google's button where the server has no Google client and no Outlook either. */
  notSetUp: "Google Calendar isn’t set up on this server yet.",
  reconnect: "Reconnect",
  showBlocks: "Show blocks in Google Calendar",
  showBlocksNote: "Adds a calendar called Sparehour to your Google Calendar. Your blocks go there and nowhere else.",
  fullTitle: "Meeting titles and your main calendar",
  fullSays: "Sparehour reads only when you’re busy, and keeps blocks in its own calendar, so colleagues don’t see them. Full access adds meeting titles, and lets blocks go on your main calendar.",
  full: "Turn on full access",
  /** Google's warning screen, named before the person meets it. */
  fullNote: "Google will say it hasn’t verified Sparehour yet. Choose Advanced, then Go to Sparehour.",
} as const;

/** The button under the accounts: another account of a provider already connected, or the first of the other. */
export const connectMoreLabel = (provider: CalendarProviderId, accounts: readonly Pick<CalendarAccountView, "provider">[]): string =>
  has(accounts, provider) ? `Add another ${provider === "google" ? "Google" : "Outlook"} account` : `Connect ${PROVIDER_NAME[provider]}`;
