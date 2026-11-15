// The calendars a person can connect, as the app names them, and where connecting each one starts (DECISIONS.md,
// amendment 2026-11-15: Outlook beside Google, read only). Plain data, shared by Settings › Calendar, the first run
// and Today's calendar lines, so none of them pulls another in.

export type CalendarProviderId = "google" | "microsoft";

/** `calendar_connections.provider` as one of the two; anything older or unknown is Google, which came first. */
export const providerOf = (provider: string | null | undefined): CalendarProviderId => (provider === "microsoft" ? "microsoft" : "google");

export const PROVIDER_NAME: Record<CalendarProviderId, string> = { google: "Google Calendar", microsoft: "Outlook" };

/**
 * The route that starts a provider's consent and comes back to `next`. A full navigation, never client routing: the
 * route answers with a redirect to Google or Microsoft. `purpose` is Google's (write, full); Outlook has one consent.
 */
export const connectHref = (provider: CalendarProviderId, next: string, purpose?: "write" | "full"): string =>
  `/api/calendar/${provider}/start?${purpose && provider === "google" ? `purpose=${purpose}&` : ""}next=${encodeURIComponent(next)}`;
