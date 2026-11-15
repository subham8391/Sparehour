// Outlook / Microsoft 365 over Microsoft Graph, on plain fetch (SYSTEM_DESIGN.md §6.8; DECISIONS.md, amendment
// 2026-11-15): sign-in with the Microsoft identity platform v2.0, the person's calendars, and each calendar's events
// through the delta query over a calendar view. Read only: nothing here writes to Outlook. No SDK, as with Google:
// the surface is small and a fake fetch tests all of it. Every request to Microsoft goes through the `fetchImpl`
// each function is given.
//
// Written from these pages, read on 2026-11-15, and what each one settled:
// - event: delta — https://learn.microsoft.com/en-us/graph/api/event-delta?view=graph-rest-1.0
//   The request, its two query parameters, `Prefer: odata.maxpagesize`, times in UTC when no time zone is asked for;
//   `$select` is refused, so Graph always sends the whole event; `@removed` also names events outside the window;
//   Calendars.Read is "least privileged", Calendars.ReadBasic is listed beside it as accepted.
// - Get incremental changes to events in a calendar view — https://learn.microsoft.com/en-us/graph/delta-query-events
//   A round: `@odata.nextLink` until `@odata.deltaLink`; the links carry the window and are used as they come; each
//   calendar is tracked on its own; the sample responses the tests are shaped on.
// - Delta query overview — https://learn.microsoft.com/en-us/graph/delta-query-overview
//   410 Gone means start again; an Outlook delta token lasts as long as Graph's cache keeps it and then answers a
//   "40X-series error with error codes such as syncStateNotFound"; the same change can come twice.
// - List calendarView — https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0
//   The path for one calendar (`/me/calendars/{id}/calendarView`); a value without an offset is read as UTC;
//   Calendars.ReadBasic is its least privileged permission. Graph's own model
//   (https://graph.microsoft.com/v1.0/$metadata) binds `delta` to any collection of events, which is what lets it
//   follow that path; the event: delta page itself only shows the default calendar's.
// - List calendars, calendar — https://learn.microsoft.com/en-us/graph/api/user-list-calendars?view=graph-rest-1.0,
//   https://learn.microsoft.com/en-us/graph/api/resources/calendar?view=graph-rest-1.0
//   `/me/calendars` (least privileged: Calendars.ReadBasic), `name`, `hexColor` (empty until the person picks a
//   colour), `isDefaultCalendar`, `canEdit`, `isSharedWithMe`.
// - event, responseStatus — https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0,
//   https://learn.microsoft.com/en-us/graph/api/resources/responsestatus?view=graph-rest-1.0
//   The fields in the table below and their values.
// - Permissions reference — https://learn.microsoft.com/en-us/graph/permissions-reference
//   Calendars.ReadBasic: "read events in user calendars, except for properties such as body, attachments, and
//   extensions"; delegated only, no admin consent. There is no permission for busy times alone.
// - Throttling, errors — https://learn.microsoft.com/en-us/graph/throttling, https://learn.microsoft.com/en-us/graph/errors
//   429 with `Retry-After` in seconds (503 may carry one too); the error body, whose nested codes are all read.
// - OAuth 2.0 authorization code flow — https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
//   The two endpoints, their parameters, PKCE "recommended for all application types", the token errors, and that
//   each refresh hands back a new refresh token to keep.
// - Scopes and ID token claims — https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc,
//   https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference
//   `offline_access` is what brings a refresh token; a scope without a resource means Graph; `sub` is the account's
//   lasting id for this app; `email` comes with the `email` scope where the account has an address.
//
// What a Graph event becomes (the mirror's words are Google's, see provider.ts), and what the capacity engine
// (core/capacity: countsAsBusy, and its out-of-office handling) then does with it:
//
//   Graph                                   | ProviderEvent                                  | the day's number
//   ----------------------------------------|------------------------------------------------|---------------------------
//   showAs free                             | busy false                                     | not counted
//   showAs tentative                        | busy true, status "tentative"                  | counted
//   showAs busy                             | busy true                                      | counted
//   showAs oof                              | busy true, eventType "outOfOffice"             | its hours leave the working day
//   showAs workingElsewhere                 | busy false, eventType "workingLocation"        | not counted (at work, elsewhere)
//   showAs unknown, or none sent            | busy true                                      | counted: safer than a guess of free
//   responseStatus accepted                 | selfResponse "accepted"                        | counted
//   responseStatus tentativelyAccepted      | selfResponse "tentative"                       | counted
//   responseStatus declined                 | selfResponse "declined"                        | not counted
//   responseStatus notResponded             | selfResponse "needsAction"                     | counted, shown as unanswered
//   responseStatus organizer, or isOrganizer| selfResponse "accepted"                        | counted (the person's own meeting)
//   responseStatus none, not the organizer  | selfResponse null                              | counted (nothing to answer)
//   isCancelled true                        | status "cancelled"                             | leaves the mirror
//   @removed (any reason)                   | status "cancelled", the id and nothing else    | leaves the mirror
//   isAllDay true                           | allDay, startDate / endDate (end exclusive)    | never busy; with oof, the day is out of office
//   isAllDay false                          | startAt / endAt, UTC                           | as above
//   type seriesMaster                       | dropped                                        | a calendar view holds occurrences
//   subject, attendees, location, body…     | never read: summary is always null             | shown as "Busy"
import { backoffDelay, type BackoffOptions, type TokenGrant } from "./google";
import { CalendarUnreadable, FullSyncRequired, NeedsReauth, type CalendarProvider, type EventPage, type ProviderCalendar, type ProviderEvent } from "./provider";
import { windowAround } from "./sync";

/** `common`: work or school accounts and personal Outlook.com accounts alike (Calendars.ReadBasic is delegated to both). */
export const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
export const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
export const GRAPH_ORIGIN = "https://graph.microsoft.com";
const API = `${GRAPH_ORIGIN}/v1.0`;

/** Events without their body, attachments and extensions: the narrowest permission the delta query takes. */
export const CALENDARS_READ_BASIC_SCOPE = "Calendars.ReadBasic";

/**
 * What connecting asks for (DECISIONS.md, amendments 2026-10-21 and 2026-11-15): who it is, a refresh token, and the
 * least Graph has for reading a calendar. Microsoft has no permission for busy times alone, so the titles this one
 * would allow are simply never kept (`toProviderEvent`).
 */
export const MICROSOFT_SCOPES = {
  identity: ["openid", "email"],
  offline: ["offline_access"],
  busy: [CALENDARS_READ_BASIC_SCOPE],
} as const;

export const CONNECT_SCOPES: readonly string[] = [...MICROSOFT_SCOPES.identity, ...MICROSOFT_SCOPES.offline, ...MICROSOFT_SCOPES.busy];

export interface MicrosoftOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * The consent address. `select_account` because a browser often holds a work account and a personal one, and the
 * address a person signs in to Sparehour with says nothing about where their meetings are, so no login hint is sent.
 * A refresh token comes with `offline_access` every time; no forced consent is needed for it.
 */
export function authorizationUrl(cfg: MicrosoftOAuthConfig, scopes: readonly string[], state: string, codeChallenge: string): string {
  const url = new URL(MICROSOFT_AUTH_URL);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** The token response names Graph scopes short (`Calendars.ReadBasic`) or in full (`https://graph.microsoft.com/…`); kept short. */
export function grantedScopes(scope: string | undefined): string[] {
  return (scope ?? "")
    .split(" ")
    .filter(Boolean)
    .map((s) => (s.toLowerCase().startsWith(`${GRAPH_ORIGIN}/`) ? s.slice(GRAPH_ORIGIN.length + 1) : s));
}

function decodeIdToken(idToken: string | undefined): { sub: string | null; email: string | null } {
  if (!idToken) return { sub: null, email: null };
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub?: string; email?: string; preferred_username?: string };
    return { sub: payload.sub ?? null, email: payload.email ?? payload.preferred_username ?? null };
  } catch {
    return { sub: null, email: null };
  }
}

/** The grant is gone or needs the person again (expired, revoked, a new sign-in step): only reconnecting mends these. */
const REAUTH_ERRORS = new Set(["invalid_grant", "interaction_required", "consent_required"]);

async function tokenRequest(body: Record<string, string>, fetchImpl: typeof fetch, now: () => Date): Promise<TokenGrant> {
  const res = await fetchImpl(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string; error_description?: string; error_codes?: number[] };
  if (!res.ok || !json.access_token) {
    if (json.error && REAUTH_ERRORS.has(json.error)) throw new NeedsReauth(json.error);
    // The description carries trace ids and is long; the code Microsoft's error pages are indexed by is enough to look it up.
    throw new Error(`microsoft token: ${json.error ?? res.status}${json.error_codes?.length ? ` (AADSTS${json.error_codes[0]})` : ""}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(now().getTime() + (json.expires_in ?? 3600) * 1000),
    scopes: grantedScopes(json.scope),
    ...decodeIdToken(json.id_token),
  };
}

const scopeParam = CONNECT_SCOPES.join(" ");

export const exchangeCode = (cfg: MicrosoftOAuthConfig, code: string, codeVerifier: string, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()) =>
  tokenRequest({ client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: scopeParam, code, redirect_uri: cfg.redirectUri, grant_type: "authorization_code", code_verifier: codeVerifier }, fetchImpl, now);

/** Microsoft answers every refresh with a new refresh token as well; the account worker stores whichever comes back. */
export const refreshAccessToken = (cfg: MicrosoftOAuthConfig, refreshToken: string, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()) =>
  tokenRequest({ client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: scopeParam, refresh_token: refreshToken, grant_type: "refresh_token" }, fetchImpl, now);

// ---------------------------------------------------------------------------
// Throttling: 429 (and 503) with Retry-After in seconds; Graph asks that the wait be honoured rather than guessed.
// ---------------------------------------------------------------------------

/** The longest one request waits before trying again; a longer Retry-After is left for the next pass. */
export const MAX_RETRY_WAIT_MS = 32_000;

/** How long to wait before the next try, or null when Graph asks for longer than this pass can give. */
export function retryDelay(retryAfter: string | null, attempt: number, random: () => number = Math.random): number | null {
  const seconds = retryAfter === null || retryAfter.trim() === "" ? Number.NaN : Number(retryAfter);
  if (!Number.isFinite(seconds) || seconds < 0) return backoffDelay(attempt, random); // none sent: the same backoff as Google's
  return seconds * 1000 > MAX_RETRY_WAIT_MS ? null : seconds * 1000;
}

async function graphFetch(fetchImpl: typeof fetch, accessToken: string, url: string, headers: Record<string, string>, opts: BackoffOptions): Promise<Response> {
  const attempts = opts.attempts ?? 5;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, { method: "GET", headers: { ...headers, authorization: `Bearer ${accessToken}` } });
    if (res.status !== 429 && res.status !== 503) return res;
    if (attempt + 1 >= attempts) return res;
    const wait = retryDelay(res.headers.get("retry-after"), attempt, opts.random);
    if (wait === null) return res;
    await sleep(wait);
  }
}

interface GraphError {
  code?: string;
  innererror?: GraphError;
  innerError?: GraphError;
}

/** Every code in an error body, outermost first, lower-cased: Graph nests the specific one inside the general one. */
async function errorCodes(res: Response): Promise<string[]> {
  const body = (await res.clone().json().catch(() => ({}))) as { error?: GraphError };
  const codes: string[] = [];
  for (let e = body.error, depth = 0; e && depth < 6; e = e.innererror ?? e.innerError, depth++) if (e.code) codes.push(e.code.toLowerCase());
  return codes;
}

/** A link Graph handed back (the next page, or where the next round starts) is only ever followed back to Graph. */
const isGraphLink = (link: string): boolean => {
  try {
    return new URL(link).origin === GRAPH_ORIGIN;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// The API surface the app uses.
// ---------------------------------------------------------------------------
interface RawCalendar {
  id: string;
  name?: string;
  hexColor?: string;
  isDefaultCalendar?: boolean;
  canEdit?: boolean;
  isSharedWithMe?: boolean;
}

interface RawDateTime {
  dateTime?: string;
  timeZone?: string;
}

/** Only what the table at the top reads. The title and the guests are in what Graph sends and have no field here. */
interface RawEvent {
  id: string;
  "@odata.etag"?: string;
  "@removed"?: { reason?: string };
  changeKey?: string;
  type?: string;
  seriesMasterId?: string | null;
  originalStart?: string | null;
  start?: RawDateTime;
  end?: RawDateTime;
  isAllDay?: boolean;
  isCancelled?: boolean;
  isOrganizer?: boolean;
  showAs?: string;
  responseStatus?: { response?: string };
}

/** The fields asked for: the calendar's owner and the rest are not needed, so they are not fetched. */
const CALENDAR_FIELDS = "id,name,hexColor,isDefaultCalendar,canEdit,isSharedWithMe";

/** Up to this many events a page; Graph may send fewer. Google's page is the same size. */
export const EVENTS_PAGE_SIZE = 250;

/**
 * A delta link carries the window it was first asked with, so a window that should follow today has to be asked for
 * again now and then: a link older than this starts a full sync with a fresh window (§6.8, "re-baselined monthly").
 */
export const REBASELINE_DAYS = 30;

/**
 * The person's own calendars, in the mirror's words: one they can write is theirs ("owner"), one they cannot
 * (Birthdays) is "reader", and the default calendar is the primary. So the default and their own count as busy
 * from the start and the read-only ones do not, as with Google.
 */
export function toProviderCalendar(c: RawCalendar): ProviderCalendar {
  return {
    externalId: c.id,
    summary: c.name?.trim() || "Calendar",
    timezone: null, // an Outlook calendar has none of its own; event times come in UTC
    color: c.hexColor && /^#[0-9a-f]{6}$/i.test(c.hexColor) ? c.hexColor : null,
    accessRole: c.canEdit === false ? "reader" : "owner",
    primary: c.isDefaultCalendar === true,
  };
}

/** `2026-11-16T09:30:00.0000000` with `timeZone: "UTC"`: seven decimals and no Z. Anything but UTC is refused, not guessed at. */
function utcIso(t: RawDateTime | undefined): string | null {
  if (!t?.dateTime) return null;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/.exec(t.dateTime);
  if (!m) throw new Error("microsoft event: a time came in a form that cannot be read");
  if (!m[3] && t.timeZone && t.timeZone.toUpperCase() !== "UTC") throw new Error(`microsoft event: times came in ${t.timeZone}, not UTC`);
  return new Date(`${m[1]}${m[2] ? `.${m[2].slice(0, 3)}` : ""}${m[3] ?? "Z"}`).toISOString();
}

/** An all-day event runs midnight to midnight; its days are the dates as written, the end exclusive. */
const dayOf = (t: RawDateTime | undefined): string | null => (t?.dateTime && /^\d{4}-\d{2}-\d{2}/.test(t.dateTime) ? t.dateTime.slice(0, 10) : null);

function selfResponse(e: RawEvent): string | null {
  const response = e.responseStatus?.response;
  if (response === "declined") return "declined";
  if (response === "tentativelyAccepted") return "tentative";
  if (response === "notResponded") return "needsAction";
  if (response === "accepted" || response === "organizer" || e.isOrganizer === true) return "accepted";
  return null; // "none": Graph's word for no invitation to answer, as on an appointment
}

/** An event that left: the engine takes "cancelled" as "remove this id", in or out of the window. */
const removed = (id: string): ProviderEvent => ({ externalId: id, recurringEventId: null, originalStartAt: null, summary: null, startAt: null, endAt: null, startDate: null, endDate: null, allDay: false, busy: false, status: "cancelled", selfResponse: null, eventType: "default", isOurs: false, etag: null });

/** The table at the top of this file, as code. Null for a series master, which a calendar view should never hold. */
export function toProviderEvent(e: RawEvent): ProviderEvent | null {
  if (e["@removed"]) return removed(e.id);
  if (e.type === "seriesMaster") return null;
  const allDay = e.isAllDay === true;
  const showAs = e.showAs ?? "unknown";
  return {
    externalId: e.id,
    recurringEventId: e.seriesMasterId ?? null,
    originalStartAt: e.originalStart && !Number.isNaN(Date.parse(e.originalStart)) ? new Date(e.originalStart).toISOString() : null,
    summary: null, // the person agreed to busy times; the title Graph sends is not kept (DECISIONS.md, 2026-11-15)
    startAt: allDay ? null : utcIso(e.start),
    endAt: allDay ? null : utcIso(e.end),
    startDate: allDay ? dayOf(e.start) : null,
    endDate: allDay ? dayOf(e.end) : null,
    allDay,
    busy: showAs !== "free" && showAs !== "workingElsewhere",
    status: e.isCancelled === true ? "cancelled" : showAs === "tentative" ? "tentative" : "confirmed",
    selfResponse: selfResponse(e),
    eventType: showAs === "oof" ? "outOfOffice" : showAs === "workingElsewhere" ? "workingLocation" : "default",
    isOurs: false, // nothing is written to Outlook, so nothing there is ours
    etag: e["@odata.etag"] ?? e.changeKey ?? null,
  };
}

/** What `calendars.sync_token` holds for an Outlook calendar: the day its window was asked for, and Graph's delta link. */
export const syncTokenFor = (day: string, deltaLink: string): string => `${day}|${deltaLink}`;

export function readSyncToken(token: string): { day: string; link: string } | null {
  const at = token.indexOf("|");
  const day = token.slice(0, at);
  const link = token.slice(at + 1);
  return at === 10 && /^\d{4}-\d{2}-\d{2}$/.test(day) && isGraphLink(link) ? { day, link } : null;
}

const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The first request of a full sync: the engine's own window (sync.ts), in UTC, the last day included. */
export function calendarViewDeltaUrl(externalCalendarId: string, today: string): string {
  const window = windowAround(today);
  const end = new Date(Date.parse(`${window.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return `${API}/me/calendars/${encodeURIComponent(externalCalendarId)}/calendarView/delta?startDateTime=${window.from}T00:00:00Z&endDateTime=${end}T00:00:00Z`;
}

export interface MicrosoftCalendarOptions {
  backoff?: BackoffOptions;
  /** YYYY-MM-DD, UTC: the day a window is built around and a delta link's age is counted from. */
  today?: () => string;
}

export class MicrosoftCalendar implements CalendarProvider {
  private readonly backoff: BackoffOptions;
  private readonly today: () => string;

  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
    options: MicrosoftCalendarOptions = {},
  ) {
    this.backoff = options.backoff ?? {};
    this.today = options.today ?? (() => new Date().toISOString().slice(0, 10));
  }

  private async get(url: string, headers: Record<string, string> = {}): Promise<Response> {
    const res = await graphFetch(this.fetchImpl, this.accessToken, url, headers, this.backoff);
    if (res.status === 401) throw new NeedsReauth("microsoft answered 401");
    return res;
  }

  /** The person's own calendars. One somebody shared with them is left out: this permission does not reach its events. */
  async listCalendars(): Promise<ProviderCalendar[]> {
    const out: ProviderCalendar[] = [];
    let url: string | null = `${API}/me/calendars?$top=100&$select=${CALENDAR_FIELDS}`;
    for (let pages = 0; url; pages++) {
      if (pages > 50) throw new Error("microsoft calendars: the list did not end");
      const res = await this.get(url);
      if (!res.ok) throw new Error(`microsoft calendars: ${res.status}${await codeNote(res)}`);
      const json = (await res.json()) as { value?: RawCalendar[]; "@odata.nextLink"?: string };
      for (const c of json.value ?? []) if (c.isSharedWithMe !== true) out.push(toProviderCalendar(c));
      url = json["@odata.nextLink"] ?? null;
      if (url && !isGraphLink(url)) throw new Error("microsoft calendars: the next page is not on Graph");
    }
    return out;
  }

  /**
   * One page of a calendar's events. With no cursor it opens a full sync over the window; `pageToken` is Graph's
   * `@odata.nextLink`; `syncToken` is what an earlier round ended on (`syncTokenFor`). The last page of a round
   * carries the next sync token. A link Graph no longer takes, or one grown old, asks for a full sync.
   */
  async listEvents(externalCalendarId: string, cursor: { syncToken?: string | null; pageToken?: string | null }): Promise<EventPage> {
    const today = this.today();
    const round = cursor.syncToken ? readSyncToken(cursor.syncToken) : null;
    if (cursor.syncToken && !cursor.pageToken && (!round || daysBetween(round.day, today) > REBASELINE_DAYS)) throw new FullSyncRequired();
    const link = cursor.pageToken ?? round?.link ?? null;
    if (link && !isGraphLink(link)) throw new Error("microsoft calendarView delta: the next page is not on Graph");
    const res = await this.get(link ?? calendarViewDeltaUrl(externalCalendarId, today), { prefer: `odata.maxpagesize=${EVENTS_PAGE_SIZE}` });
    if (!res.ok) {
      const codes = await errorCodes(res);
      const clientError = res.status >= 400 && res.status < 500;
      // 410: Graph reset the series. syncStateNotFound: the token left its cache. And on a link of Graph's own, a
      // plain 400 or 404 can only mean the link is no good any more; a fresh full sync is the one cure for all three.
      if (res.status === 410 || (clientError && codes.includes("syncstatenotfound")) || (link !== null && (res.status === 400 || res.status === 404))) throw new FullSyncRequired();
      const what = `microsoft calendarView delta: ${res.status}${codes.length ? ` ${codes[codes.length - 1]}` : ""}`;
      // Refused or not found is about this calendar; throttling and Graph's own failures are about the moment.
      throw clientError && res.status !== 408 && res.status !== 429 ? new CalendarUnreadable(what) : new Error(what);
    }
    const json = (await res.json()) as { value?: RawEvent[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };
    const items: ProviderEvent[] = [];
    for (const raw of json.value ?? []) {
      const event = toProviderEvent(raw);
      if (event) items.push(event);
    }
    const deltaLink = json["@odata.deltaLink"] ?? null;
    return {
      items,
      nextPageToken: json["@odata.nextLink"] ?? null,
      // A round that began on a stored link keeps that link's window, so it keeps its day too.
      nextSyncToken: deltaLink ? syncTokenFor(round?.day ?? today, deltaLink) : null,
    };
  }
}

/** The most specific error code Graph gave, for the line a person may read ("… 403 erroraccessdenied"). */
async function codeNote(res: Response): Promise<string> {
  const codes = await errorCodes(res);
  return codes.length ? ` ${codes[codes.length - 1]}` : "";
}
