// The three steps of connecting a calendar from the phone, with the outside handed in so they are tested as they
// are (../../../src/server/calendar/app-connect.ts is the server's half):
//
//   1. app-start, with this person's sign-in token: the server answers the provider's consent address.
//   2. The consent, in the system browser. The server's callback saves nothing there; it sends the browser back to
//      the app's link with a sealed ticket.
//   3. app-finish, with the ticket and the same sign-in token. The server connects the account only for the
//      person who started it.
//
// The app never sees the provider's code or tokens, and it never decides who the account is for.
import type { BrowserReturn } from "~/auth/browser-session";
import { CALENDAR_APP_LINK } from "~/auth/return-link";
import type { CalendarProvider, ConnectOutcome, ConnectPurpose } from "./connect";

export interface ConnectDeps {
  /** A call to the web app's API as the person signed in (~/api's `apiFetch`). */
  api: (path: string, init?: RequestInit) => Promise<Response>;
  /** One round trip through the system browser (~/auth/browser-session). */
  session: (startUrl: string, returnLink: string) => Promise<BrowserReturn>;
}

/** The only places a consent is opened: the provider's own sign-in host, over HTTPS, whatever the server answered. */
const CONSENT_HOST: Record<CalendarProvider, string> = {
  google: "https://accounts.google.com/",
  microsoft: "https://login.microsoftonline.com/",
};

const post = (api: ConnectDeps["api"], path: string, body: Record<string, string>) => api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function field(res: Response, name: string): Promise<string | null> {
  const body: unknown = await res.json().catch(() => null);
  const value = body !== null && typeof body === "object" ? (body as Record<string, unknown>)[name] : null;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The server's word for what came of a consent (the web's own: api/calendar/google/callback) as one of the app's
 * four. "connected" only when what was asked for was granted. A consent the person narrowed on the provider's
 * screen (read_only: blocks asked for, not granted; full_denied: titles asked for, not granted; no_read: the
 * busy-times box unticked) is their no, like closing the browser; anything unknown is a failure.
 */
export function outcomeOf(word: string | null): ConnectOutcome {
  if (word === "connected" || word === "full") return "connected";
  if (word === "read_only" || word === "full_denied" || word === "no_read") return "cancelled";
  return "failed";
}

export async function runConnect(provider: CalendarProvider, purpose: ConnectPurpose, deps: ConnectDeps): Promise<ConnectOutcome> {
  try {
    const started = await post(deps.api, `/api/calendar/${provider}/app-start`, { purpose });
    // 503: this server has no Google client; 404: no Outlook at all (as the web's routes answer).
    if (started.status === 503 || started.status === 404) return "unavailable";
    if (!started.ok) return "failed";
    const url = await field(started, "url");
    if (!url || !url.startsWith(CONSENT_HOST[provider])) return "failed";

    const back = await deps.session(url, CALENDAR_APP_LINK);
    if (back.type === "closed") return "cancelled";
    if (back.params.error === "denied") return "cancelled";
    const ticket = back.params.ticket;
    if (!ticket) return "failed";

    // Once: the provider redeems a code a single time, so a ticket is never sent again.
    const finished = await post(deps.api, `/api/calendar/${provider}/app-finish`, { ticket });
    if (!finished.ok) return "failed";
    return outcomeOf(await field(finished, "outcome"));
  } catch {
    return "failed";
  }
}

/** Which calendars this server can connect (/api/calendar/config); none when it cannot be asked, as the web takes it. */
export async function fetchAvailable(api: ConnectDeps["api"]): Promise<{ google: boolean; microsoft: boolean }> {
  try {
    const res = await api("/api/calendar/config");
    const body = (res.ok ? await res.json().catch(() => null) : null) as { google?: unknown; microsoft?: unknown } | null;
    return { google: body?.google === true, microsoft: body?.microsoft === true };
  } catch {
    return { google: false, microsoft: false };
  }
}
