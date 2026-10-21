// Google Calendar over plain fetch (SYSTEM_DESIGN.md §6): OAuth with
// incremental consent, the frozen sync parameter set, the §5.4 event
// classification, and the §6.7 backoff. No SDK — the surface is small and a
// fake fetch tests all of it.
import { FullSyncRequired, NeedsReauth, type CalendarProvider, type EventPage, type ProviderCalendar, type ProviderEvent } from "./provider";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

export const CALENDAR_LIST_SCOPE = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
export const FREEBUSY_SCOPE = "https://www.googleapis.com/auth/calendar.events.freebusy";
/** Event details: titles, responses. Sensitive, so Google shows its unverified-app screen until Sparehour is verified. */
export const EVENTS_READ_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
export const EVENTS_OWNED_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";
export const APP_CREATED_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";

/**
 * §6.1 as amended 2026-10-21 (DECISIONS.md): connect asks only for the non-sensitive `busy` set (no warning screen);
 * writing adds the app-created calendar, also non-sensitive; full access (titles, blocks on the person's own calendars)
 * is the opt-in, and the only request that brings Google's unverified-app screen.
 */
export const SCOPES = {
  identity: ["openid", "email"],
  busy: [CALENDAR_LIST_SCOPE, FREEBUSY_SCOPE],
  read: [EVENTS_READ_SCOPE, CALENDAR_LIST_SCOPE],
  writeOwned: [EVENTS_OWNED_SCOPE],
  writeAppCreated: [APP_CREATED_SCOPE],
} as const;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function authorizationUrl(cfg: GoogleOAuthConfig, scopes: readonly string[], state: string, loginHint?: string | null): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent"); // a refresh token every time, not only the first
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  if (loginHint) url.searchParams.set("login_hint", loginHint);
  return url.toString();
}

export interface TokenGrant {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string[];
  /** From the id_token when identity scopes were asked for. */
  sub: string | null;
  email: string | null;
}

function decodeIdToken(idToken: string | undefined): { sub: string | null; email: string | null } {
  if (!idToken) return { sub: null, email: null };
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub?: string; email?: string };
    return { sub: payload.sub ?? null, email: payload.email ?? null };
  } catch {
    return { sub: null, email: null };
  }
}

async function tokenRequest(body: Record<string, string>, fetchImpl: typeof fetch, now: () => Date): Promise<TokenGrant> {
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    if (json.error === "invalid_grant") throw new NeedsReauth(json.error_description ?? "invalid_grant");
    throw new Error(`google token: ${json.error ?? res.status}${json.error_description ? ` — ${json.error_description}` : ""}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(now().getTime() + (json.expires_in ?? 3600) * 1000),
    scopes: (json.scope ?? "").split(" ").filter(Boolean),
    ...decodeIdToken(json.id_token),
  };
}

export const exchangeCode = (cfg: GoogleOAuthConfig, code: string, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()) =>
  tokenRequest({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" }, fetchImpl, now);

export const refreshAccessToken = (cfg: GoogleOAuthConfig, refreshToken: string, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()) =>
  tokenRequest({ refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" }, fetchImpl, now);

/** Best effort: Google answers 200 or 400 (already revoked); either way the grant is gone. */
export async function revokeToken(token: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    await fetchImpl(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    // unreachable: the row is deleted regardless; the grant expires on its own
  }
}

// ---------------------------------------------------------------------------
// Backoff (§6.7): 403 rateLimitExceeded / userRateLimitExceeded and 429 alike,
// min(2^n + jitter, 32 s), eight attempts.
// ---------------------------------------------------------------------------
export interface BackoffOptions {
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  return Math.min(2 ** attempt * 1000 + Math.floor(random() * 1000), 32_000);
}

const RETRYABLE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);

async function googleFetch(fetchImpl: typeof fetch, accessToken: string, url: string, init: RequestInit, opts: BackoffOptions): Promise<Response> {
  const attempts = opts.attempts ?? 8;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${accessToken}` } });
    if (res.status !== 429 && res.status !== 403) return res;
    const body = (await res.clone().json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[] } };
    const reason = body.error?.errors?.[0]?.reason ?? "";
    if (res.status === 403 && !RETRYABLE_REASONS.has(reason)) return res;
    if (attempt + 1 >= attempts) return res;
    await sleep(backoffDelay(attempt, opts.random));
  }
}

// ---------------------------------------------------------------------------
// The API surface the app uses.
// ---------------------------------------------------------------------------
interface RawCalendar {
  id: string;
  summary?: string;
  summaryOverride?: string;
  timeZone?: string;
  backgroundColor?: string;
  accessRole?: string;
  primary?: boolean;
  deleted?: boolean;
}

interface RawEvent {
  id: string;
  etag?: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  transparency?: string;
  eventType?: string;
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
  extendedProperties?: { private?: Record<string, string> };
}

/** What we write (§6.5). `colorId` is deliberately absent: the colour map is not fetched yet, and hardcoding one is a bug waiting to happen. */
export interface EventBody {
  id?: string;
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  transparency: "opaque";
  reminders: { useDefault: false; overrides: [] };
  extendedProperties: { private: Record<string, string> };
}

export type WriteResult = { outcome: "written"; eventId: string; etag: string | null } | { outcome: "exists" } | { outcome: "conflict" } | { outcome: "gone" };

/** The frozen parameter set (§6.3): every request in a sync series must match. */
export const EVENT_LIST_PARAMS = { singleEvents: "true", showDeleted: "true", maxResults: "250", eventTypes: ["default", "focusTime", "outOfOffice"] } as const;

/** One busy stretch from `freeBusy.query`, UTC ISO. */
export interface BusyInterval {
  start: string;
  end: string;
}

/** Per calendar: the busy stretches, or why Google would not say (notFound, internalError…); the calendar is then left as it was. */
export type BusyAnswer = Record<string, { busy: BusyInterval[]; error: string | null }>;

/** At most this many calendars in one `freeBusy.query` (Google's `calendarExpansionMax`). */
export const FREEBUSY_MAX_CALENDARS = 50;

export function toProviderCalendar(c: RawCalendar): ProviderCalendar {
  return {
    externalId: c.id,
    summary: c.summaryOverride ?? c.summary ?? c.id,
    timezone: c.timeZone ?? null,
    color: c.backgroundColor ?? null,
    accessRole: c.accessRole ?? "reader",
    primary: c.primary === true,
  };
}

const toUtcIso = (dateTime: string) => new Date(dateTime).toISOString();

export function toProviderEvent(e: RawEvent): ProviderEvent {
  const allDay = Boolean(e.start?.date) && !e.start?.dateTime;
  const self = e.attendees?.find((a) => a.self);
  return {
    externalId: e.id,
    recurringEventId: e.recurringEventId ?? null,
    originalStartAt: e.originalStartTime?.dateTime ? toUtcIso(e.originalStartTime.dateTime) : (e.originalStartTime?.date ?? null),
    summary: e.summary ?? null,
    startAt: !allDay && e.start?.dateTime ? toUtcIso(e.start.dateTime) : null,
    endAt: !allDay && e.end?.dateTime ? toUtcIso(e.end.dateTime) : null,
    startDate: allDay ? (e.start?.date ?? null) : null,
    endDate: allDay ? (e.end?.date ?? null) : null,
    allDay,
    busy: e.transparency !== "transparent",
    status: e.status ?? "confirmed",
    selfResponse: self?.responseStatus ?? null,
    eventType: e.eventType ?? "default",
    isOurs: e.extendedProperties?.private?.sparehour === "1",
    etag: e.etag ?? null,
  };
}

export class GoogleCalendar implements CalendarProvider {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly backoff: BackoffOptions = {},
  ) {}

  private async get(url: string): Promise<Response> {
    const res = await googleFetch(this.fetchImpl, this.accessToken, url, { method: "GET" }, this.backoff);
    if (res.status === 401) throw new NeedsReauth("google answered 401");
    return res;
  }

  async listCalendars(): Promise<ProviderCalendar[]> {
    const out: ProviderCalendar[] = [];
    let pageToken: string | null = null;
    do {
      const url = new URL(`${API}/users/me/calendarList`);
      url.searchParams.set("maxResults", "250");
      url.searchParams.set("showHidden", "false");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await this.get(url.toString());
      if (!res.ok) throw new Error(`google calendarList: ${res.status}`);
      const json = (await res.json()) as { items?: RawCalendar[]; nextPageToken?: string };
      for (const c of json.items ?? []) if (!c.deleted) out.push(toProviderCalendar(c));
      pageToken = json.nextPageToken ?? null;
    } while (pageToken);
    return out;
  }

  private async post(url: string, body: unknown): Promise<Response> {
    const res = await googleFetch(this.fetchImpl, this.accessToken, url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, this.backoff);
    if (res.status === 401) throw new NeedsReauth("google answered 401");
    return res;
  }

  /** §6.4: a push channel on one calendar; Google answers with the resource id and the expiry it granted. */
  async watch(externalCalendarId: string, channel: { id: string; address: string; token: string; ttlSeconds: number }): Promise<{ resourceId: string; expiresAt: Date }> {
    const res = await this.post(`${API}/calendars/${encodeURIComponent(externalCalendarId)}/events/watch`, {
      id: channel.id,
      type: "web_hook",
      address: channel.address,
      token: channel.token,
      params: { ttl: String(channel.ttlSeconds) },
    });
    if (!res.ok) throw new Error(`google events.watch: ${res.status}`);
    const json = (await res.json()) as { resourceId?: string; expiration?: string };
    if (!json.resourceId) throw new Error("google events.watch: no resourceId");
    return { resourceId: json.resourceId, expiresAt: new Date(Number(json.expiration ?? Date.now() + channel.ttlSeconds * 1000)) };
  }

  async stop(channelId: string, resourceId: string): Promise<void> {
    const res = await this.post(`${API}/channels/stop`, { id: channelId, resourceId });
    if (!res.ok && res.status !== 404) throw new Error(`google channels.stop: ${res.status}`);
  }

  // ---- writing (§6.5) ----------------------------------------------------

  private async send(method: "POST" | "PUT" | "DELETE", url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
    const res = await googleFetch(this.fetchImpl, this.accessToken, url, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }, this.backoff);
    if (res.status === 401) throw new NeedsReauth("google answered 401");
    return res;
  }

  /** events.insert with our own id; `sendUpdates=none` so a personal block never emails anyone. */
  async insertEvent(externalCalendarId: string, body: EventBody): Promise<WriteResult> {
    const url = `${API}/calendars/${encodeURIComponent(externalCalendarId)}/events?sendUpdates=none`;
    const res = await this.send("POST", url, body);
    if (res.status === 409) return { outcome: "exists" };
    if (!res.ok) throw new Error(`google events.insert: ${res.status}`);
    const json = (await res.json()) as { id: string; etag?: string };
    return { outcome: "written", eventId: json.id, etag: json.etag ?? null };
  }

  /** events.update guarded by If-Match; a 412 means someone else changed it (§6.6, external edit). */
  async updateEvent(externalCalendarId: string, eventId: string, body: EventBody, ifMatch: string | null): Promise<WriteResult> {
    const url = `${API}/calendars/${encodeURIComponent(externalCalendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`;
    const res = await this.send("PUT", url, body, ifMatch ? { "if-match": ifMatch } : {});
    if (res.status === 412) return { outcome: "conflict" };
    if (res.status === 404 || res.status === 410) return { outcome: "gone" };
    if (!res.ok) throw new Error(`google events.update: ${res.status}`);
    const json = (await res.json()) as { id: string; etag?: string };
    return { outcome: "written", eventId: json.id, etag: json.etag ?? null };
  }

  /** events.delete; 404 and 410 count as done (§6.5). */
  async deleteEvent(externalCalendarId: string, eventId: string): Promise<void> {
    const url = `${API}/calendars/${encodeURIComponent(externalCalendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`;
    const res = await this.send("DELETE", url);
    if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`google events.delete: ${res.status}`);
  }

  async getEvent(externalCalendarId: string, eventId: string): Promise<ProviderEvent | null> {
    const res = await this.get(`${API}/calendars/${encodeURIComponent(externalCalendarId)}/events/${encodeURIComponent(eventId)}`);
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) throw new Error(`google events.get: ${res.status}`);
    return toProviderEvent((await res.json()) as RawEvent);
  }

  /** The privacy option (§6.1): an app-owned calendar under calendar.app.created. */
  async createCalendar(summary: string, timezone: string | null): Promise<ProviderCalendar> {
    const res = await this.send("POST", `${API}/calendars`, { summary, ...(timezone ? { timeZone: timezone } : {}) });
    if (!res.ok) throw new Error(`google calendars.insert: ${res.status}`);
    return toProviderCalendar({ ...((await res.json()) as RawCalendar), accessRole: "owner" });
  }

  /** `freeBusy.query` (§6.1 as amended): busy start and end times for up to 50 calendars, nothing else about the events. */
  async freeBusy(externalCalendarIds: readonly string[], timeMin: string, timeMax: string): Promise<BusyAnswer> {
    const res = await this.post(`${API}/freeBusy`, { timeMin, timeMax, items: externalCalendarIds.map((id) => ({ id })) });
    if (!res.ok) throw new Error(`google freeBusy: ${res.status}`);
    const json = (await res.json()) as { calendars?: Record<string, { busy?: BusyInterval[]; errors?: { reason?: string }[] }> };
    const out: BusyAnswer = {};
    for (const id of externalCalendarIds) {
      const c = json.calendars?.[id];
      out[id] = c?.errors?.length ? { busy: [], error: c.errors[0]?.reason ?? "error" } : { busy: (c?.busy ?? []).map((b) => ({ start: toUtcIso(b.start), end: toUtcIso(b.end) })), error: c ? null : "missing" };
    }
    return out;
  }

  async listEvents(externalCalendarId: string, cursor: { syncToken?: string | null; pageToken?: string | null }): Promise<EventPage> {
    const url = new URL(`${API}/calendars/${encodeURIComponent(externalCalendarId)}/events`);
    url.searchParams.set("singleEvents", EVENT_LIST_PARAMS.singleEvents);
    url.searchParams.set("showDeleted", EVENT_LIST_PARAMS.showDeleted);
    url.searchParams.set("maxResults", EVENT_LIST_PARAMS.maxResults);
    for (const t of EVENT_LIST_PARAMS.eventTypes) url.searchParams.append("eventTypes", t);
    if (cursor.syncToken) url.searchParams.set("syncToken", cursor.syncToken);
    if (cursor.pageToken) url.searchParams.set("pageToken", cursor.pageToken);
    const res = await this.get(url.toString());
    if (res.status === 410) throw new FullSyncRequired();
    if (!res.ok) throw new Error(`google events.list: ${res.status}`);
    const json = (await res.json()) as { items?: RawEvent[]; nextPageToken?: string; nextSyncToken?: string };
    return { items: (json.items ?? []).map(toProviderEvent), nextPageToken: json.nextPageToken ?? null, nextSyncToken: json.nextSyncToken ?? null };
  }
}
