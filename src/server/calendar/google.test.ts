import { describe, expect, it, vi } from "vitest";
import { GoogleCalendar, SCOPES, authorizationUrl, backoffDelay, exchangeCode, refreshAccessToken, toProviderCalendar, toProviderEvent } from "./google";
import { FullSyncRequired, NeedsReauth } from "./provider";

const cfg = { clientId: "cid", clientSecret: "secret", redirectUri: "http://localhost:3000/api/calendar/google/callback" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("authorizationUrl", () => {
  it("asks for offline access with consent, incremental scopes and the signed state", () => {
    const url = new URL(authorizationUrl(cfg, [...SCOPES.identity, ...SCOPES.read], "STATE", "sam@example.com"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("state")).toBe("STATE");
    expect(url.searchParams.get("login_hint")).toBe("sam@example.com");
    expect(url.searchParams.get("redirect_uri")).toBe(cfg.redirectUri);
  });
});

describe("token exchange and refresh", () => {
  const idToken = `x.${Buffer.from(JSON.stringify({ sub: "g-123", email: "sam@gmail.com" })).toString("base64url")}.y`;

  it("exchanges a code for tokens and reads who it is from the id token", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("CODE");
      return json({ access_token: "at", refresh_token: "rt", expires_in: 3599, scope: "openid email https://www.googleapis.com/auth/calendar.events.readonly", id_token: idToken });
    });
    const grant = await exchangeCode(cfg, "CODE", fetchImpl as unknown as typeof fetch, () => new Date("2026-09-15T10:00:00Z"));
    expect(grant).toEqual({
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: new Date("2026-09-15T10:59:59Z"),
      scopes: ["openid", "email", "https://www.googleapis.com/auth/calendar.events.readonly"],
      sub: "g-123",
      email: "sam@gmail.com",
    });
  });

  it("a revoked grant on refresh is NeedsReauth; other failures are plain errors", async () => {
    const revoked = vi.fn(async () => json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400));
    await expect(refreshAccessToken(cfg, "rt", revoked as unknown as typeof fetch)).rejects.toBeInstanceOf(NeedsReauth);
    const down = vi.fn(async () => new Response("bad gateway", { status: 502 }));
    await expect(refreshAccessToken(cfg, "rt", down as unknown as typeof fetch)).rejects.toThrow(/502/);
  });
});

describe("event classification (§5.4)", () => {
  it("maps timed, all-day, free, declined, focus-time and our own events", () => {
    const timed = toProviderEvent({
      id: "e1",
      etag: '"1"',
      status: "confirmed",
      summary: "Standup",
      start: { dateTime: "2026-09-15T09:00:00+02:00" },
      end: { dateTime: "2026-09-15T09:30:00+02:00" },
      attendees: [{ self: false, responseStatus: "accepted" }, { self: true, responseStatus: "needsAction" }],
    });
    expect(timed).toMatchObject({ externalId: "e1", startAt: "2026-09-15T07:00:00.000Z", endAt: "2026-09-15T07:30:00.000Z", allDay: false, busy: true, selfResponse: "needsAction", eventType: "default", isOurs: false, etag: '"1"' });

    const allDay = toProviderEvent({ id: "e2", start: { date: "2026-09-20" }, end: { date: "2026-09-21" }, transparency: "transparent" });
    expect(allDay).toMatchObject({ startAt: null, startDate: "2026-09-20", endDate: "2026-09-21", allDay: true, busy: false, status: "confirmed", summary: null });

    const ours = toProviderEvent({
      id: "e3",
      eventType: "focusTime",
      start: { dateTime: "2026-09-15T13:00:00Z" },
      end: { dateTime: "2026-09-15T14:00:00Z" },
      recurringEventId: "series",
      originalStartTime: { dateTime: "2026-09-15T12:00:00Z" },
      extendedProperties: { private: { sparehour: "1", block_id: "b1" } },
    });
    expect(ours).toMatchObject({ eventType: "focusTime", isOurs: true, recurringEventId: "series", originalStartAt: "2026-09-15T12:00:00.000Z" });
  });

  it("maps a calendar list entry, preferring the person's own name for it", () => {
    expect(toProviderCalendar({ id: "sam@gmail.com", summary: "sam@gmail.com", summaryOverride: "Personal", timeZone: "Europe/Berlin", backgroundColor: "#9fe1e7", accessRole: "owner", primary: true })).toEqual({
      externalId: "sam@gmail.com",
      summary: "Personal",
      timezone: "Europe/Berlin",
      color: "#9fe1e7",
      accessRole: "owner",
      primary: true,
    });
  });
});

describe("GoogleCalendar", () => {
  it("lists events with the frozen parameter set, follows sync tokens, and turns 410 and 401 into typed errors", async () => {
    const seen: URL[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = new URL(String(url));
      seen.push(u);
      if (u.searchParams.get("syncToken") === "gone") return json({ error: { code: 410 } }, 410);
      if (u.searchParams.get("syncToken") === "expired-auth") return json({}, 401);
      return json({ items: [{ id: "e1", start: { dateTime: "2026-09-15T09:00:00Z" }, end: { dateTime: "2026-09-15T10:00:00Z" } }], nextSyncToken: "T2" });
    });
    const g = new GoogleCalendar("at", fetchImpl as unknown as typeof fetch);
    const page = await g.listEvents("primary", { syncToken: "T1" });
    expect(page.items[0].externalId).toBe("e1");
    expect(page.nextSyncToken).toBe("T2");
    const u = seen[0];
    expect(u.pathname).toBe("/calendar/v3/calendars/primary/events");
    expect(u.searchParams.get("singleEvents")).toBe("true");
    expect(u.searchParams.get("showDeleted")).toBe("true");
    expect(u.searchParams.get("maxResults")).toBe("250");
    expect(u.searchParams.getAll("eventTypes")).toEqual(["default", "focusTime", "outOfOffice"]);
    expect(u.searchParams.get("syncToken")).toBe("T1");
    expect(u.searchParams.has("timeMin")).toBe(false);
    await expect(g.listEvents("primary", { syncToken: "gone" })).rejects.toBeInstanceOf(FullSyncRequired);
    await expect(g.listEvents("primary", { syncToken: "expired-auth" })).rejects.toBeInstanceOf(NeedsReauth);
  });

  it("backs off on rate limits with capped exponential delays and gives up after the attempts", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      return json({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, 403);
    });
    const slept: number[] = [];
    const g = new GoogleCalendar("at", fetchImpl as unknown as typeof fetch, { attempts: 3, sleep: async (ms) => void slept.push(ms), random: () => 0.5 });
    await expect(g.listCalendars()).rejects.toThrow(/403/);
    expect(calls).toBe(3);
    expect(slept).toEqual([1500, 2500]);
    expect(backoffDelay(10, () => 0)).toBe(32_000);
    // A 403 for any other reason is not retried.
    const forbidden = vi.fn(async () => json({ error: { errors: [{ reason: "insufficientPermissions" }] } }, 403));
    await expect(new GoogleCalendar("at", forbidden as unknown as typeof fetch).listCalendars()).rejects.toThrow(/403/);
    expect(forbidden).toHaveBeenCalledTimes(1);
  });

  it("pages through the calendar list and skips deleted entries", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = new URL(String(url));
      if (u.searchParams.get("pageToken") === "2") return json({ items: [{ id: "b", summary: "B", accessRole: "reader", deleted: true }, { id: "c", summary: "C", accessRole: "reader" }] });
      return json({ items: [{ id: "a", summary: "A", accessRole: "owner", primary: true }], nextPageToken: "2" });
    });
    const list = await new GoogleCalendar("at", fetchImpl as unknown as typeof fetch).listCalendars();
    expect(list.map((c) => c.externalId)).toEqual(["a", "c"]);
  });
});
