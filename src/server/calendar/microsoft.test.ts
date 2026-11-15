// Outlook over Graph against a fake fetch. No Microsoft account or app registration exists here, so every response
// below is written in the shape the Microsoft Learn pages show (the URLs are at the top of microsoft.ts): the token
// response and its errors, a calendars list, a delta round with a next link and a delta link, an expired token,
// throttling. What only a real account can show is listed in DECISIONS.md, amendment 2026-11-15.
import { describe, expect, it, vi } from "vitest";
import { capacityFor, countsAsBusy, type CapacityEvent } from "@/core/capacity";
import { instant, localDate, localTime } from "@/core/time";
import {
  CALENDARS_READ_BASIC_SCOPE,
  CONNECT_SCOPES,
  EVENTS_PAGE_SIZE,
  MAX_RETRY_WAIT_MS,
  MicrosoftCalendar,
  authorizationUrl,
  calendarViewDeltaUrl,
  exchangeCode,
  grantedScopes,
  readSyncToken,
  refreshAccessToken,
  retryDelay,
  syncTokenFor,
  toProviderCalendar,
  toProviderEvent,
} from "./microsoft";
import { CalendarUnreadable, FullSyncRequired, NeedsReauth, type ProviderEvent } from "./provider";

const cfg = { clientId: "00001111-aaaa-2222-bbbb-3333cccc4444", clientSecret: "secret", redirectUri: "http://localhost:3000/api/calendar/microsoft/callback" };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const TODAY = "2026-11-15";
const GRAPH = "https://graph.microsoft.com/v1.0";

type Fetch = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
const client = (fetchImpl: Fetch, sleep: (ms: number) => Promise<void> = async () => undefined) =>
  new MicrosoftCalendar("ACCESS", fetchImpl as unknown as typeof fetch, { today: () => TODAY, backoff: { sleep, random: () => 0 } });

/** An event as the delta samples show one, with the fields the event resource page lists. Its title must never be kept. */
const graphEvent = (over: Record<string, unknown> = {}) => ({
  "@odata.type": "#microsoft.graph.event",
  "@odata.etag": 'W/"EZ9r3czxY0m2jz8c45czkwAAFXcvIQ=="',
  id: "AAMkADNVxRAAA=",
  subject: "Quarterly salary review",
  bodyPreview: "Confidential",
  start: { dateTime: "2026-11-16T09:30:00.0000000", timeZone: "UTC" },
  end: { dateTime: "2026-11-16T10:00:00.0000000", timeZone: "UTC" },
  isAllDay: false,
  isCancelled: false,
  isOrganizer: false,
  showAs: "busy",
  type: "singleInstance",
  seriesMasterId: null,
  responseStatus: { response: "accepted", time: "2026-11-10T08:00:00Z" },
  attendees: [{ emailAddress: { name: "Samantha Booth", address: "samanthab@contoso.com" }, status: { response: "none" } }],
  organizer: { emailAddress: { name: "Samantha Booth", address: "samanthab@contoso.com" } },
  location: { displayName: "Room 4" },
  ...over,
});

describe("authorizationUrl and the scopes (DECISIONS.md, amendment 2026-11-15)", () => {
  it("asks the v2.0 common endpoint for a code, with the signed state, a PKCE challenge and an account picker", () => {
    const url = new URL(authorizationUrl(cfg, CONNECT_SCOPES, "STATE", "CHALLENGE"));
    expect(url.origin + url.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(url.searchParams.get("client_id")).toBe(cfg.clientId);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("response_mode")).toBe("query");
    expect(url.searchParams.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(url.searchParams.get("scope")).toBe("openid email offline_access Calendars.ReadBasic");
    expect(url.searchParams.get("state")).toBe("STATE");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("code_challenge")).toBe("CHALLENGE");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    // The address someone signs in to Sparehour with is not a hint about where their meetings are.
    expect(url.searchParams.has("login_hint")).toBe(false);
  });

  it("connecting asks for the least: basic calendar reading and a refresh token, never full reading or writing", () => {
    expect(CONNECT_SCOPES).toEqual(["openid", "email", "offline_access", CALENDARS_READ_BASIC_SCOPE]);
    for (const more of ["Calendars.Read", "Calendars.ReadWrite", "Calendars.Read.Shared", "User.Read", "profile"]) expect(CONNECT_SCOPES).not.toContain(more);
  });

  it("reads granted scopes in either form the token response uses", () => {
    expect(grantedScopes("openid email https://graph.microsoft.com/Calendars.ReadBasic")).toEqual(["openid", "email", "Calendars.ReadBasic"]);
    expect(grantedScopes("Calendars.ReadBasic openid")).toEqual(["Calendars.ReadBasic", "openid"]);
    expect(grantedScopes(undefined)).toEqual([]);
  });
});

describe("token exchange and refresh", () => {
  const idToken = `x.${Buffer.from(JSON.stringify({ sub: "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ", email: "sam@contoso.com", tid: "9188040d-6c67-4c5b-b112-36a304b66dad" })).toString("base64url")}.y`;
  const tokens = { access_token: "eyJ0eXAi.access", token_type: "Bearer", expires_in: 3599, scope: "openid email https://graph.microsoft.com/Calendars.ReadBasic", refresh_token: "AwABAAAAvPM1.refresh", id_token: idToken };
  const at = () => new Date("2026-11-15T10:00:00Z");

  it("exchanges a code at the token endpoint with the secret and the PKCE verifier, and reads who it is from the id token", async () => {
    const fetchImpl = vi.fn<Fetch>(async (url, init) => {
      expect(String(url)).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
      expect(init?.method).toBe("POST");
      expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
        client_id: cfg.clientId,
        client_secret: "secret",
        scope: "openid email offline_access Calendars.ReadBasic",
        code: "CODE",
        redirect_uri: cfg.redirectUri,
        grant_type: "authorization_code",
        code_verifier: "VERIFIER",
      });
      return json(tokens);
    });
    expect(await exchangeCode(cfg, "CODE", "VERIFIER", fetchImpl as unknown as typeof fetch, at)).toEqual({
      accessToken: "eyJ0eXAi.access",
      refreshToken: "AwABAAAAvPM1.refresh",
      expiresAt: new Date("2026-11-15T10:59:59Z"),
      scopes: ["openid", "email", "Calendars.ReadBasic"],
      sub: "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ",
      email: "sam@contoso.com",
    });
  });

  it("a refresh sends the refresh token and brings back the new one Microsoft issues with it", async () => {
    const fetchImpl = vi.fn<Fetch>(async (_url, init) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("OLD");
      expect(body.get("client_secret")).toBe("secret");
      expect(body.has("code")).toBe(false);
      return json({ ...tokens, refresh_token: "NEW", id_token: undefined });
    });
    const grant = await refreshAccessToken(cfg, "OLD", fetchImpl as unknown as typeof fetch, at);
    expect(grant).toMatchObject({ accessToken: "eyJ0eXAi.access", refreshToken: "NEW", sub: null, email: null });
  });

  it("a grant that is gone, or needs the person again, is NeedsReauth", async () => {
    // The error response as the auth code flow page shows it.
    const body = (error: string, code: number) => ({ error, error_description: `AADSTS${code}: The refresh token has expired due to inactivity.\r\nTrace ID: 0000aaaa-11bb-cccc-dd22-eeeeee333333`, error_codes: [code], timestamp: "2026-11-15 10:00:00Z", trace_id: "0000aaaa-11bb-cccc-dd22-eeeeee333333", correlation_id: "aaaa0000-bb11-2222-33cc-444444dddddd" });
    for (const [error, code] of [["invalid_grant", 700082], ["interaction_required", 50076], ["consent_required", 65001]] as const) {
      const refused = vi.fn<Fetch>(async () => json(body(error, code), 400));
      await expect(refreshAccessToken(cfg, "rt", refused as unknown as typeof fetch), error).rejects.toBeInstanceOf(NeedsReauth);
    }
  });

  it("a bad client secret is the server's problem, not the person's: a plain error naming Microsoft's code, without its trace ids", async () => {
    const refused = vi.fn<Fetch>(async () => json({ error: "invalid_client", error_description: "AADSTS7000215: Invalid client secret provided.\r\nTrace ID: 0000aaaa-11bb-cccc-dd22-eeeeee333333", error_codes: [7000215] }, 401));
    const failure = await refreshAccessToken(cfg, "rt", refused as unknown as typeof fetch).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(NeedsReauth);
    expect((failure as Error).message).toBe("microsoft token: invalid_client (AADSTS7000215)");
    const down = vi.fn<Fetch>(async () => new Response("upstream", { status: 503 }));
    await expect(refreshAccessToken(cfg, "rt", down as unknown as typeof fetch)).rejects.toThrow("microsoft token: 503");
  });
});

describe("listCalendars", () => {
  // The calendar resource's properties, as the List calendars response shows them.
  const calendar = (over: Record<string, unknown>) => ({ id: "AAMkAGI2TGuLAAA=", name: "Calendar", color: "auto", hexColor: "", isDefaultCalendar: false, canEdit: true, canShare: true, isSharedWithMe: false, owner: { name: "Samantha Booth", address: "samanthab@contoso.com" }, ...over });

  it("lists the person's own calendars across pages, with the token in the Authorization header only", async () => {
    const fetchImpl = vi.fn<Fetch>(async (url, init) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer ACCESS");
      expect(String(url)).not.toContain("ACCESS");
      if (String(url) === `${GRAPH}/me/calendars?$top=100&$select=id,name,hexColor,isDefaultCalendar,canEdit,isSharedWithMe`) {
        return json({ "@odata.context": `${GRAPH}/$metadata#users('me')/calendars`, "@odata.nextLink": `${GRAPH}/me/calendars?$top=100&$skip=100`, value: [calendar({ isDefaultCalendar: true }), calendar({ id: "bday", name: "Birthdays", canEdit: false })] });
      }
      expect(String(url)).toBe(`${GRAPH}/me/calendars?$top=100&$skip=100`);
      return json({ value: [calendar({ id: "side", name: " Side project ", hexColor: "#E3008C" }), calendar({ id: "theirs", name: "Alex's calendar", isSharedWithMe: true, canEdit: false })] });
    });
    expect(await client(fetchImpl).listCalendars()).toEqual([
      { externalId: "AAMkAGI2TGuLAAA=", summary: "Calendar", timezone: null, color: null, accessRole: "owner", primary: true },
      // Read-only and not the default: listed, and not counted as busy until the person says so (defaultRead).
      { externalId: "bday", summary: "Birthdays", timezone: null, color: null, accessRole: "reader", primary: false },
      { externalId: "side", summary: "Side project", timezone: null, color: "#E3008C", accessRole: "owner", primary: false },
      // "Alex's calendar" was shared with the person: Calendars.ReadBasic does not reach its events, so it is not offered.
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("a calendar's colour is kept only when it is a colour; a nameless one still has a name", () => {
    expect(toProviderCalendar({ id: "x", hexColor: "red; background:url(x)" })).toMatchObject({ color: null, summary: "Calendar", accessRole: "owner", primary: false });
  });

  it("a 401 is NeedsReauth, another failure names Graph's code, and a next page somewhere else is not followed", async () => {
    await expect(client(async () => json({ error: { code: "InvalidAuthenticationToken", message: "Access token has expired or is not yet valid." } }, 401)).listCalendars()).rejects.toBeInstanceOf(NeedsReauth);
    await expect(client(async () => json({ error: { code: "ErrorAccessDenied", message: "Access is denied." } }, 403)).listCalendars()).rejects.toThrow("microsoft calendars: 403 erroraccessdenied");
    const elsewhere = vi.fn<Fetch>(async () => json({ value: [], "@odata.nextLink": "https://graph.microsoft.com.evil.example/v1.0/me/calendars" }));
    await expect(client(elsewhere).listCalendars()).rejects.toThrow(/not on Graph/);
    expect(elsewhere).toHaveBeenCalledTimes(1);
  });
});

describe("listEvents: the delta query over a calendar view", () => {
  const first = `${GRAPH}/me/calendars/AAMkAGI2TGuLAAA%3D/calendarView/delta?startDateTime=2026-08-17T00:00:00Z&endDateTime=2027-12-21T00:00:00Z`;
  const nextLink = `${GRAPH}/me/calendars('AAMkAGI2TGuLAAA=')/calendarView/delta?$skiptoken=R0usmcCM996atia_s`;
  const deltaLink = `${GRAPH}/me/calendars('AAMkAGI2TGuLAAA=')/calendarView/delta?$deltatoken=R0usmcMDNGg0J1E`;

  it("a full sync asks for the window around today (90 days back, 400 ahead, UTC) and follows the next link to the delta link", async () => {
    expect(calendarViewDeltaUrl("AAMkAGI2TGuLAAA=", TODAY)).toBe(first);
    const fetchImpl = vi.fn<Fetch>(async (url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer ACCESS");
      expect(headers.get("prefer")).toBe(`odata.maxpagesize=${EVENTS_PAGE_SIZE}`);
      if (String(url) === first) return json({ "@odata.context": `${GRAPH}/$metadata#Collection(event)`, "@odata.nextLink": nextLink, value: [graphEvent(), graphEvent({ id: "AAMkADVxSAAA=" })] });
      expect(String(url)).toBe(nextLink); // the link as Graph gave it: the window is inside its token
      return json({ "@odata.context": `${GRAPH}/$metadata#Collection(event)`, "@odata.deltaLink": deltaLink, value: [graphEvent({ id: "AAMkADj1HuAAA=" })] });
    });
    const outlook = client(fetchImpl);
    const one = await outlook.listEvents("AAMkAGI2TGuLAAA=", {});
    expect(one.items.map((e) => e.externalId)).toEqual(["AAMkADNVxRAAA=", "AAMkADVxSAAA="]);
    expect(one).toMatchObject({ nextPageToken: nextLink, nextSyncToken: null });
    const two = await outlook.listEvents("AAMkAGI2TGuLAAA=", { pageToken: one.nextPageToken });
    expect(two.items).toHaveLength(1);
    // The sync token is the delta link, with the day its window was asked for.
    expect(two).toMatchObject({ nextPageToken: null, nextSyncToken: `2026-11-15|${deltaLink}` });
    expect(readSyncToken(two.nextSyncToken!)).toEqual({ day: "2026-11-15", link: deltaLink });
  });

  it("the next round starts on the stored delta link, takes what changed and what left, and keeps the window's day", async () => {
    const newer = `${deltaLink}NEXT`;
    const fetchImpl = vi.fn<Fetch>(async (url) => {
      expect(String(url)).toBe(deltaLink);
      // "The next round: sample first response": one event removed, one changed.
      return json({ "@odata.deltaLink": newer, value: [{ "@odata.type": "#microsoft.graph.event", id: "AAMkADk0MGFkODE3LWE4MmYtNDRhOS04OGQLkRkXbBznTvAADb6ytyAAA=", "@removed": { reason: "deleted" } }, graphEvent({ id: "AAMkADj1HvAAA=" })] });
    });
    const page = await client(fetchImpl).listEvents("AAMkAGI2TGuLAAA=", { syncToken: syncTokenFor("2026-11-01", deltaLink) });
    // Removed, in or out of the window (Graph names both): "cancelled" is the engine's word for "remove this id".
    expect(page.items[0]).toMatchObject({ externalId: "AAMkADk0MGFkODE3LWE4MmYtNDRhOS04OGQLkRkXbBznTvAADb6ytyAAA=", status: "cancelled", startAt: null, startDate: null });
    expect(page.items[1]).toMatchObject({ externalId: "AAMkADj1HvAAA=", status: "confirmed" });
    expect(page.nextSyncToken).toBe(`2026-11-01|${newer}`);
  });

  it("a delta token Graph no longer has asks for a full sync: 410, syncStateNotFound, or a stored link that answers 400 or 404", async () => {
    const stored = { syncToken: syncTokenFor("2026-11-10", deltaLink) };
    const answers = [
      json({ error: { code: "resyncRequired", message: "Resync required." } }, 410, { location: first }),
      // Nested, as the errors page says codes are: the specific one inside the general one.
      json({ error: { code: "BadRequest", message: "Bad request.", innerError: { code: "SyncStateNotFound", "request-id": "94fb3b52-452a-4535-a601-69e0a90e3aa2", date: "2026-11-15T10:00:00" } } }, 400),
      json({ error: { code: "ErrorInvalidRequest", message: "The sync state is not valid." } }, 400),
      json({ error: { code: "ErrorItemNotFound", message: "The specified object was not found in the store." } }, 404),
    ];
    for (const answer of answers) await expect(client(async () => answer).listEvents("AAMkAGI2TGuLAAA=", stored), String(answer.status)).rejects.toBeInstanceOf(FullSyncRequired);
    // On the first request of a full sync there is no link to have gone stale: only 410 and the token's own code restart.
    await expect(client(async () => json({ error: { code: "syncStateNotFound" } }, 404)).listEvents("AAMkAGI2TGuLAAA=", {})).rejects.toBeInstanceOf(FullSyncRequired);
  });

  it("a delta link older than a month, or a token that is not one of ours, starts a full sync without asking Graph", async () => {
    const never = vi.fn<Fetch>(async () => json({ value: [] }));
    const outlook = client(never);
    await expect(outlook.listEvents("cal", { syncToken: syncTokenFor("2026-10-15", deltaLink) })).rejects.toBeInstanceOf(FullSyncRequired); // 31 days
    await expect(outlook.listEvents("cal", { syncToken: "T-from-google" })).rejects.toBeInstanceOf(FullSyncRequired);
    await expect(outlook.listEvents("cal", { syncToken: syncTokenFor("2026-11-10", "https://evil.example/v1.0/delta") })).rejects.toBeInstanceOf(FullSyncRequired);
    expect(never).not.toHaveBeenCalled();
    // Thirty days is still inside it.
    await outlook.listEvents("cal", { syncToken: syncTokenFor("2026-10-16", deltaLink) });
    expect(never).toHaveBeenCalledTimes(1);
  });

  it("a calendar Graph refuses or cannot find is this calendar's problem; Graph's own failures are not; a 401 is NeedsReauth", async () => {
    const refused = await client(async () => json({ error: { code: "ErrorAccessDenied", message: "Access is denied. Check credentials and try again." } }, 403))
      .listEvents("cal", {})
      .catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(CalendarUnreadable);
    expect((refused as Error).message).toBe("microsoft calendarView delta: 403 erroraccessdenied");
    await expect(client(async () => json({ error: { code: "ErrorItemNotFound" } }, 404)).listEvents("cal", {})).rejects.toBeInstanceOf(CalendarUnreadable);
    const down = await client(async () => json({ error: { code: "generalException" } }, 500))
      .listEvents("cal", {})
      .catch((e: unknown) => e);
    expect(down).not.toBeInstanceOf(CalendarUnreadable);
    expect((down as Error).message).toBe("microsoft calendarView delta: 500 generalexception");
    await expect(client(async () => json({ error: { code: "InvalidAuthenticationToken" } }, 401)).listEvents("cal", {})).rejects.toBeInstanceOf(NeedsReauth);
  });

  it("never follows a page link that is not Graph's", async () => {
    const never = vi.fn<Fetch>(async () => json({ value: [] }));
    await expect(client(never).listEvents("cal", { pageToken: "https://example.com/steal" })).rejects.toThrow(/not on Graph/);
    expect(never).not.toHaveBeenCalled();
  });

  describe("throttling (429 with Retry-After, in seconds)", () => {
    // The sample response on the throttling page.
    const throttled = (retryAfter?: string) => json({ error: { code: "TooManyRequests", innerError: { code: "429", date: "2020-08-18T12:51:51", message: "Please retry after", "request-id": "94fb3b52-452a-4535-a601-69e0a90e3aa2", status: "429" }, message: "Please retry again later." } }, 429, retryAfter ? { "retry-after": retryAfter } : {});

    it("waits as long as Graph asks, then tries again", async () => {
      const waits: number[] = [];
      const fetchImpl = vi.fn<Fetch>().mockResolvedValueOnce(throttled("10")).mockResolvedValueOnce(json({ value: [], "@odata.deltaLink": deltaLink }));
      const page = await client(fetchImpl, async (ms) => void waits.push(ms)).listEvents("cal", {});
      expect(waits).toEqual([10_000]);
      expect(page.nextSyncToken).toBe(`2026-11-15|${deltaLink}`);
    });

    it("backs off on its own when no wait is given, a 503 included, and gives up after five tries with a plain error", async () => {
      const waits: number[] = [];
      const fetchImpl = vi.fn<Fetch>(async () => (waits.length % 2 ? new Response("busy", { status: 503 }) : throttled()));
      const failure = await client(fetchImpl, async (ms) => void waits.push(ms))
        .listEvents("cal", {})
        .catch((e: unknown) => e);
      expect(fetchImpl).toHaveBeenCalledTimes(5);
      expect(waits).toEqual([1000, 2000, 4000, 8000]);
      // Throttling is about the moment, not the calendar: the account's other calendars are not read past it.
      expect(failure).not.toBeInstanceOf(CalendarUnreadable);
      expect((failure as Error).message).toMatch(/^microsoft calendarView delta: (429|503)/);
    });

    it("a wait longer than a pass can give is left for the next pass", async () => {
      const sleep = vi.fn(async () => undefined);
      const fetchImpl = vi.fn<Fetch>(async () => throttled("600"));
      await expect(client(fetchImpl, sleep).listEvents("cal", {})).rejects.toThrow("microsoft calendarView delta: 429");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(retryDelay("600", 0)).toBeNull();
      expect(retryDelay(String(MAX_RETRY_WAIT_MS / 1000), 0)).toBe(MAX_RETRY_WAIT_MS);
      expect(retryDelay("0", 3)).toBe(0);
      expect(retryDelay(null, 2, () => 0)).toBe(4000);
      expect(retryDelay("Wed, 21 Oct 2026 07:28:00 GMT", 0, () => 0)).toBe(1000); // not seconds: the backoff instead
    });
  });
});

// ---------------------------------------------------------------------------
// The mapping table at the top of microsoft.ts, row by row, through the capacity engine.
// ---------------------------------------------------------------------------
const MONDAY = "2026-11-16";
const asCapacity = (e: ProviderEvent): CapacityEvent => ({
  id: e.externalId,
  startAt: e.startAt ? instant(e.startAt) : null,
  endAt: e.endAt ? instant(e.endAt) : null,
  startDate: e.startDate ? localDate(e.startDate) : null,
  endDate: e.endDate ? localDate(e.endDate) : null,
  allDay: e.allDay,
  busy: e.busy,
  status: e.status as CapacityEvent["status"],
  selfResponse: e.selfResponse as CapacityEvent["selfResponse"],
  eventType: e.eventType as CapacityEvent["eventType"],
  isOurs: e.isOurs,
  calendarRead: true,
});
const mapped = (over: Record<string, unknown> = {}): ProviderEvent => toProviderEvent(graphEvent(over) as never)!;
const dayWith = (...events: ProviderEvent[]) =>
  capacityFor({
    day: localDate(MONDAY),
    settings: { timezone: "UTC", bufferPct: 15, defaultEstimateMin: 30 },
    workHours: [{ weekday: 1, start: localTime("09:00"), end: localTime("17:00") }],
    events: events.map(asCapacity),
    blocks: [],
    tasks: [],
  });

describe("toProviderEvent: what a Graph event becomes, and what the day's number does with it", () => {
  it("show-as: free and working elsewhere do not count; tentative, busy and an unknown one do", () => {
    const rows: [string | undefined, Partial<ProviderEvent>, boolean][] = [
      ["free", { busy: false, status: "confirmed", eventType: "default" }, false],
      ["tentative", { busy: true, status: "tentative", eventType: "default" }, true],
      ["busy", { busy: true, status: "confirmed", eventType: "default" }, true],
      ["workingElsewhere", { busy: false, status: "confirmed", eventType: "workingLocation" }, false],
      ["unknown", { busy: true, status: "confirmed", eventType: "default" }, true],
      [undefined, { busy: true, status: "confirmed", eventType: "default" }, true],
    ];
    for (const [showAs, expected, counts] of rows) {
      const e = mapped({ showAs });
      expect(e, String(showAs)).toMatchObject(expected);
      expect(countsAsBusy(asCapacity(e)), String(showAs)).toBe(counts);
      expect(dayWith(e).busyMin, String(showAs)).toBe(counts ? 30 : 0);
    }
  });

  it("show-as out of office takes its hours out of the working day, and a whole day of it leaves no working day", () => {
    const afternoon = mapped({ showAs: "oof", start: { dateTime: "2026-11-16T13:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-11-16T17:00:00.0000000", timeZone: "UTC" } });
    expect(afternoon).toMatchObject({ busy: true, eventType: "outOfOffice" });
    expect(dayWith(afternoon)).toMatchObject({ workMin: 240, busyMin: 0 });
    const away = mapped({ showAs: "oof", isAllDay: true, start: { dateTime: "2026-11-16T00:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-11-17T00:00:00.0000000", timeZone: "UTC" } });
    expect(dayWith(away)).toMatchObject({ state: "no_work_day", reason: "out_of_office" });
  });

  it("the person's response: accepted, tentatively accepted and not answered count (the last one marked); declined does not", () => {
    const rows: [string, boolean, string | null, boolean, number][] = [
      // response, isOrganizer → selfResponse, counts, unanswered minutes
      ["accepted", false, "accepted", true, 0],
      ["tentativelyAccepted", false, "tentative", true, 0],
      ["declined", false, "declined", false, 0],
      ["notResponded", false, "needsAction", true, 30],
      ["organizer", true, "accepted", true, 0],
      // Graph may give the organizer "none" in their own calendar; isOrganizer settles it.
      ["none", true, "accepted", true, 0],
      // "none" on an appointment, where there was nothing to answer: counted, and not shown as unanswered.
      ["none", false, null, true, 0],
    ];
    for (const [response, isOrganizer, selfResponse, counts, unanswered] of rows) {
      const e = mapped({ responseStatus: { response, time: "0001-01-01T00:00:00Z" }, isOrganizer });
      expect(e.selfResponse, response).toBe(selfResponse);
      expect(countsAsBusy(asCapacity(e)), response).toBe(counts);
      expect(dayWith(e), response).toMatchObject({ busyMin: counts ? 30 : 0, unansweredMin: unanswered });
    }
    expect(mapped({ responseStatus: undefined }).selfResponse).toBeNull();
  });

  it("a cancelled meeting leaves: its status is the one the engine removes on, and it never counts", () => {
    const e = mapped({ isCancelled: true, showAs: "free", subject: "Canceled: Quarterly salary review" });
    expect(e.status).toBe("cancelled");
    expect(countsAsBusy(asCapacity({ ...e, busy: true }))).toBe(false);
    expect(dayWith({ ...e, busy: true }).busyMin).toBe(0);
  });

  it("an all-day event keeps its dates, end exclusive, and is never busy", () => {
    const e = mapped({ isAllDay: true, start: { dateTime: "2026-11-16T00:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-11-18T00:00:00.0000000", timeZone: "UTC" } });
    expect(e).toMatchObject({ allDay: true, startDate: "2026-11-16", endDate: "2026-11-18", startAt: null, endAt: null });
    expect(countsAsBusy(asCapacity(e))).toBe(false);
    expect(dayWith(e)).toMatchObject({ busyMin: 0, allDayNotes: ["AAMkADNVxRAAA="] });
  });

  it("times are UTC instants, from Graph's seven decimals and missing Z; a time in another zone is refused, not guessed", () => {
    expect(mapped()).toMatchObject({ allDay: false, startAt: "2026-11-16T09:30:00.000Z", endAt: "2026-11-16T10:00:00.000Z", startDate: null, endDate: null });
    expect(mapped({ start: { dateTime: "2026-11-16T09:30:00.1234567", timeZone: "UTC" } }).startAt).toBe("2026-11-16T09:30:00.123Z");
    expect(mapped({ start: { dateTime: "2026-11-16T09:30:00Z" } }).startAt).toBe("2026-11-16T09:30:00.000Z");
    expect(mapped({ start: { dateTime: "2026-11-16T01:30:00-08:00", timeZone: "Pacific Standard Time" } }).startAt).toBe("2026-11-16T09:30:00.000Z");
    expect(() => mapped({ start: { dateTime: "2026-11-16T01:30:00.0000000", timeZone: "Pacific Standard Time" } })).toThrow(/not UTC/);
    expect(mapped({ start: undefined }).startAt).toBeNull();
  });

  it("an occurrence of a series carries the series and its original start; the series itself is not an event of the day", () => {
    const e = mapped({ type: "occurrence", seriesMasterId: "AAMkMASTER=", originalStart: "2026-11-16T09:30:00Z" });
    expect(e).toMatchObject({ recurringEventId: "AAMkMASTER=", originalStartAt: "2026-11-16T09:30:00.000Z" });
    expect(mapped({ type: "exception", seriesMasterId: "AAMkMASTER=", originalStart: "2026-11-15T09:30:00Z" }).originalStartAt).toBe("2026-11-15T09:30:00.000Z");
    expect(toProviderEvent(graphEvent({ type: "seriesMaster" }) as never)).toBeNull();
  });

  it("the title, the guests and the place are never kept, and nothing of Outlook's is ours", () => {
    const e = mapped();
    expect(e.summary).toBeNull();
    expect(e.isOurs).toBe(false);
    expect(e.etag).toBe('W/"EZ9r3czxY0m2jz8c45czkwAAFXcvIQ=="');
    const kept = JSON.stringify(e);
    for (const secret of ["salary", "Confidential", "samanthab", "Samantha", "Room 4"]) expect(kept).not.toContain(secret);
    // Where no @odata.etag comes, the change key is the version.
    expect(mapped({ "@odata.etag": undefined, changeKey: "EZ9r3czx" }).etag).toBe("EZ9r3czx");
  });

  it("a page keeps no title either", async () => {
    const page = await client(async () => json({ value: [graphEvent(), graphEvent({ id: "two", subject: "Offer for Dana" })], "@odata.deltaLink": `${GRAPH}/me/calendarView/delta?$deltatoken=x` })).listEvents("cal", {});
    expect(JSON.stringify(page.items)).not.toMatch(/salary|Dana|contoso/);
    expect(page.items.every((e) => e.summary === null)).toBe(true);
  });
});
