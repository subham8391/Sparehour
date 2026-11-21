// The calendar routes with every outside port mocked: the session, the
// service-role store, Google, Microsoft, and Next's after().
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sealToBase64 } from "@/server/calendar/crypto";
import { pkceFor, signState, verifyState } from "@/server/calendar/state";

const KEY = Buffer.alloc(32, 7).toString("base64");
const user = { id: "u1", email: "sam@example.com" };
let sessionUser: { id: string; email: string } | null = user;

vi.mock("@/server/auth/supabase", () => ({
  createUserScopedClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
  serviceRoleClient: () => ({}),
}));

// vi.mock is hoisted above every other statement, so the handles it closes over must be too.
const { store, after, syncAccountById, syncUser, syncDue, pushUser, pushDue, exchangeCode, revokeToken, exchangeMicrosoftCode } = vi.hoisted(() => ({
  store: {
    connect: vi.fn(async () => "acct-1"),
    claim: vi.fn(async () => []),
    requestSync: vi.fn(async () => undefined),
    resetSyncTokens: vi.fn(async () => undefined),
    channelAccount: vi.fn<(id: string, token: string) => Promise<string | null>>(async (_, token) => (token === "good" ? "acct-1" : null)),
    disconnect: vi.fn<(id: string, user: string) => Promise<string | null>>(async () => "sealed"),
    providerOf: vi.fn<(id: string, user: string) => Promise<string | null>>(async () => "google"),
  },
  after: vi.fn((cb: () => Promise<void> | void) => void cb()),
  syncAccountById: vi.fn(async () => ({ status: "ok", calendars: 1, events: 2, error: null })),
  syncUser: vi.fn(async () => ({ "acct-1": { status: "ok", calendars: 1, events: 2, error: null } })),
  syncDue: vi.fn(async () => ({})),
  pushUser: vi.fn(async () => ({ written: 1, deleted: 0, adopted: 0, failed: 0 })),
  pushDue: vi.fn(async () => ({ written: 0, deleted: 0, adopted: 0, failed: 0 })),
  // Plain tokens with "." and "-", which base64 never contains, so "sealed, never plain" cannot pass or fail by chance.
  exchangeCode: vi.fn(async () => ({
    accessToken: "ya29.plain-access",
    refreshToken: "1//plain-refresh",
    expiresAt: new Date("2026-09-15T11:00:00Z"),
    scopes: ["openid", "email", "https://www.googleapis.com/auth/calendar.events.readonly"],
    sub: "g-1",
    email: "sam@gmail.com",
  })),
  revokeToken: vi.fn(async () => undefined),
  // What Microsoft's token endpoint gives back, as microsoft.ts reads it: short scope names, the id token's sub and email.
  exchangeMicrosoftCode: vi.fn(async () => ({
    accessToken: "eyJ0.plain-ms-access",
    refreshToken: "AwAB.plain-ms-refresh",
    expiresAt: new Date("2026-11-15T11:00:00Z"),
    scopes: ["openid", "email", "Calendars.ReadBasic"],
    sub: "ms-sub-1" as string | null,
    email: "sam@contoso.com" as string | null,
  })),
}));
vi.mock("@/server/calendar/store", () => ({
  // `new SupabaseAccountStore(db)` hands back the shared fake.
  SupabaseAccountStore: function FakeStore() {
    return store;
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after }));
vi.mock("@/server/calendar/run", () => ({ buildDeps: () => ({ store }), syncAccountById, syncUser, syncDue, pushUser, pushDue }));
vi.mock("@/server/calendar/google", async (orig) => ({ ...(await orig<typeof import("@/server/calendar/google")>()), exchangeCode, revokeToken }));
vi.mock("@/server/calendar/microsoft", async (orig) => ({ ...(await orig<typeof import("@/server/calendar/microsoft")>()), exchangeCode: exchangeMicrosoftCode }));

import { GET as configRoute } from "./config/route";
import { POST as disconnect } from "./disconnect/route";
import { GET as callback } from "./google/callback/route";
import { GET as start } from "./google/start/route";
import { GET as outlookCallback } from "./microsoft/callback/route";
import { GET as outlookStart } from "./microsoft/start/route";
import { POST as push } from "./push/route";
import { POST as sync } from "./sync/route";
import { POST as tick } from "./tick/route";
import { POST as webhook } from "../webhooks/google-calendar/route";

const req = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`http://localhost:3000${path}`, init);

describe("calendar routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUser = user;
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
    // No Microsoft app registration unless a test says so: Outlook is absent by default.
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_ID", "");
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_SECRET", "");
    vi.stubEnv("CALENDAR_TOKEN_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("PUSH_TICK_SECRET", "jobs");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("config says which calendars this server can connect, to signed-in people only", async () => {
    // The route takes its caller from the request (the browser's cookie here; the phone app sends a bearer token).
    const config = () => configRoute(req("/api/calendar/config"));
    expect(await (await config()).json()).toEqual({ google: true, microsoft: false });
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    expect(await (await config()).json()).toEqual({ google: false, microsoft: false });
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_ID", "mid");
    expect(await (await config()).json()).toEqual({ google: false, microsoft: false }); // an id without a secret is not a client
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_SECRET", "msecret");
    expect(await (await config()).json()).toEqual({ google: false, microsoft: true });
    sessionUser = null;
    expect((await config()).status).toBe(401);
  });

  it("start sends the person to Google with busy-time scopes (no warning screen), offline access, a signed state and the callback", async () => {
    const res = await start(req("/api/calendar/google/start?next=%2Fsettings"));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    // DECISIONS.md, amendment 2026-10-21: only non-sensitive scopes at connect.
    expect(to.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.freebusy");
    expect(to.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/calendar/google/callback");
    expect(to.searchParams.get("login_hint")).toBe("sam@example.com");
    expect(to.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    // Writing asks for the app-created calendar, still non-sensitive.
    const write = new URL((await start(req("/api/calendar/google/start?purpose=write"))).headers.get("location")!);
    expect(write.searchParams.get("scope")).toContain("calendar.app.created");
    expect(write.searchParams.get("scope")).not.toContain("events.owned");
    expect(write.searchParams.get("scope")).not.toContain("events.readonly");
    // Full access is the one request with the sensitive scopes.
    const full = new URL((await start(req("/api/calendar/google/start?purpose=full"))).headers.get("location")!);
    expect(full.searchParams.get("scope")).toContain("calendar.events.readonly");
    expect(full.searchParams.get("scope")).toContain("calendar.events.owned");
  });

  it("start without a client sends the person back with 'unavailable'; without a session, to login", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "");
    expect((await start(req("/api/calendar/google/start"))).headers.get("location")).toBe("http://localhost:3000/settings?calendar=unavailable");
    sessionUser = null;
    expect((await start(req("/api/calendar/google/start"))).headers.get("location")).toMatch(/\/login\?next=/);
  });

  it("callback exchanges the code, seals the tokens into the account, syncs after answering, and returns to settings", async () => {
    const state = signState({ userId: "u1", purpose: "read", next: "/settings", nonce: "n", exp: Math.floor(Date.now() / 1000) + 60 }, KEY);
    const res = await callback(req(`/api/calendar/google/callback?code=CODE&state=${encodeURIComponent(state)}`));
    expect(res.headers.get("location")).toBe("http://localhost:3000/settings?calendar=connected");
    expect(exchangeCode).toHaveBeenCalledWith(expect.objectContaining({ clientId: "cid" }), "CODE");
    const call = store.connect.mock.calls[0] as unknown as [{ userId: string; external: string; email: string; refreshB64: string; accessB64: string; scopes: string[] }];
    expect(call[0]).toMatchObject({ userId: "u1", external: "g-1", email: "sam@gmail.com" });
    expect(call[0].refreshB64).not.toContain("plain-refresh"); // sealed, never plain
    expect(call[0].accessB64).not.toContain("plain-access");
    expect(after).toHaveBeenCalledTimes(1);
    expect(syncAccountById).toHaveBeenCalledWith("acct-1", expect.anything());
    // A new grant may change what Google returns (busy times → titles), so the first pass after it reads everything.
    expect(store.resetSyncTokens).toHaveBeenCalledWith("acct-1");
  });

  it("callback refuses a stale state, a state for someone else, and reports a decline", async () => {
    const stale = signState({ userId: "u1", purpose: "read", next: "/settings", nonce: "n", exp: 1 }, KEY);
    expect((await callback(req(`/api/calendar/google/callback?code=x&state=${encodeURIComponent(stale)}`))).headers.get("location")).toContain("calendar=error");
    const other = signState({ userId: "u2", purpose: "read", next: "/settings", nonce: "n", exp: Math.floor(Date.now() / 1000) + 60 }, KEY);
    expect((await callback(req(`/api/calendar/google/callback?code=x&state=${encodeURIComponent(other)}`))).headers.get("location")).toContain("calendar=error");
    const fine = signState({ userId: "u1", purpose: "write", next: "/settings", nonce: "n", exp: Math.floor(Date.now() / 1000) + 60 }, KEY);
    expect((await callback(req(`/api/calendar/google/callback?error=access_denied&state=${encodeURIComponent(fine)}`))).headers.get("location")).toBe("http://localhost:3000/settings?calendar=write_denied&reason=access_denied");
    // Write asked for, only read granted: the picker stays hidden and the page says so.
    expect((await callback(req(`/api/calendar/google/callback?code=x&state=${encodeURIComponent(fine)}`))).headers.get("location")).toBe("http://localhost:3000/settings?calendar=read_only");
    expect(store.connect).toHaveBeenCalledTimes(1);
  });

  it("callback says what came of full access, and of a consent where the busy-times box was unticked", async () => {
    const full = signState({ userId: "u1", purpose: "full", next: "/settings", nonce: "n", exp: Math.floor(Date.now() / 1000) + 60 }, KEY);
    expect((await callback(req(`/api/calendar/google/callback?code=x&state=${encodeURIComponent(full)}`))).headers.get("location")).toBe("http://localhost:3000/settings?calendar=full");
    expect((await callback(req(`/api/calendar/google/callback?error=access_denied&state=${encodeURIComponent(full)}`))).headers.get("location")).toBe("http://localhost:3000/settings?calendar=full_denied&reason=access_denied");
    vi.mocked(exchangeCode).mockResolvedValueOnce({ accessToken: "at", refreshToken: "rt", expiresAt: new Date("2026-09-15T11:00:00Z"), scopes: ["openid", "email"], sub: "g-1", email: "sam@gmail.com" });
    const read = signState({ userId: "u1", purpose: "read", next: "/settings", nonce: "n", exp: Math.floor(Date.now() / 1000) + 60 }, KEY);
    expect((await callback(req(`/api/calendar/google/callback?code=x&state=${encodeURIComponent(read)}`))).headers.get("location")).toBe("http://localhost:3000/settings?calendar=no_read");
  });

  it("sync now runs every account of the signed-in person", async () => {
    const res = await sync(req("/api/calendar/sync", { method: "POST" }));
    expect(await res.json()).toEqual({ accounts: 1, report: { "acct-1": { status: "ok", calendars: 1, events: 2, error: null } }, push: { written: 1, deleted: 0, adopted: 0, failed: 0 } });
    expect(syncUser).toHaveBeenCalledWith("u1");
    expect(pushUser).toHaveBeenCalledWith("u1");
    sessionUser = null;
    expect((await sync(req("/api/calendar/sync", { method: "POST" }))).status).toBe(401);
  });

  it("the tick needs the jobs secret and syncs what is due", async () => {
    expect((await tick(req("/api/calendar/tick", { method: "POST" }))).status).toBe(403);
    const ok = await tick(req("/api/calendar/tick", { method: "POST", headers: { "x-push-secret": "jobs" } }));
    expect(ok.status).toBe(200);
    expect(syncDue).toHaveBeenCalledWith(10);
    expect(pushDue).toHaveBeenCalledTimes(1);
  });

  it("push writes the signed-in person's pending blocks, and says so when the calendar is not set up", async () => {
    // The route takes its caller from the request (the browser's cookie here; the phone app sends a bearer token).
    const asked = () => push(req("/api/calendar/push", { method: "POST" }));
    expect(await (await asked()).json()).toEqual({ written: 1, deleted: 0, adopted: 0, failed: 0 });
    expect(pushUser).toHaveBeenCalledWith("u1");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "");
    expect(await (await asked()).json()).toMatchObject({ skipped: "calendar_not_configured" });
    sessionUser = null;
    expect((await asked()).status).toBe(401);
  });

  it("sync now and the tick run where only Outlook is set up, without the block push that is Google's; with neither, they do not run", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "");
    expect((await sync(req("/api/calendar/sync", { method: "POST" }))).status).toBe(503);
    expect(await (await tick(req("/api/calendar/tick", { method: "POST", headers: { "x-push-secret": "jobs" } }))).json()).toEqual({ skipped: "calendar_not_configured" });
    expect(syncUser).not.toHaveBeenCalled();
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_ID", "mid");
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_SECRET", "msecret");
    expect(await (await sync(req("/api/calendar/sync", { method: "POST" }))).json()).toMatchObject({ accounts: 1, push: { written: 0, deleted: 0, adopted: 0, failed: 0 } });
    expect(syncUser).toHaveBeenCalledWith("u1");
    expect(pushUser).not.toHaveBeenCalled();
    expect((await tick(req("/api/calendar/tick", { method: "POST", headers: { "x-push-secret": "jobs" } }))).status).toBe(200);
    expect(syncDue).toHaveBeenCalledWith(10);
    expect(pushDue).not.toHaveBeenCalled();
  });

  it("disconnect drops the account for its owner and revokes the grant", async () => {
    store.disconnect.mockResolvedValueOnce(sealToBase64("rt", Buffer.from(KEY, "base64")));
    const res = await disconnect(req("/api/calendar/disconnect", { method: "POST", body: JSON.stringify({ id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }), headers: { "content-type": "application/json" } }));
    expect(await res.json()).toEqual({ ok: true });
    expect(store.disconnect).toHaveBeenCalledWith("9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", "u1");
    expect(revokeToken).toHaveBeenCalledWith("rt");
    expect((await disconnect(req("/api/calendar/disconnect", { method: "POST", body: JSON.stringify({ id: "nope" }) }))).status).toBe(400);
    store.disconnect.mockResolvedValueOnce(null);
    expect((await disconnect(req("/api/calendar/disconnect", { method: "POST", body: JSON.stringify({ id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" }) }))).status).toBe(404);
  });

  it("disconnect works for an Outlook account too, and never hands its token to Google", async () => {
    store.providerOf.mockResolvedValueOnce("microsoft");
    store.disconnect.mockResolvedValueOnce(sealToBase64("ms-refresh", Buffer.from(KEY, "base64")));
    const id = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
    const res = await disconnect(req("/api/calendar/disconnect", { method: "POST", body: JSON.stringify({ id }), headers: { "content-type": "application/json" } }));
    expect(await res.json()).toEqual({ ok: true });
    expect(store.providerOf).toHaveBeenCalledWith(id, "u1");
    // The provider is read before the row that says it goes.
    expect(store.providerOf.mock.invocationCallOrder[0]).toBeLessThan(store.disconnect.mock.invocationCallOrder[0]);
    expect(store.disconnect).toHaveBeenCalledWith(id, "u1");
    expect(revokeToken).not.toHaveBeenCalled();
    // An account whose provider cannot be told is not revoked anywhere either.
    store.providerOf.mockResolvedValueOnce(null);
    await disconnect(req("/api/calendar/disconnect", { method: "POST", body: JSON.stringify({ id }), headers: { "content-type": "application/json" } }));
    expect(revokeToken).not.toHaveBeenCalled();
  });

  it("the webhook checks the channel token, ignores the first sync message, and otherwise asks for a sync", async () => {
    const hit = (headers: Record<string, string>) => webhook(req("/api/webhooks/google-calendar", { method: "POST", headers }));
    const ch = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect((await hit({ "x-goog-channel-id": "not-a-uuid", "x-goog-channel-token": "good", "x-goog-resource-state": "exists" })).status).toBe(404);
    expect(store.channelAccount).not.toHaveBeenCalled(); // no database round-trip for rubbish
    expect((await hit({ "x-goog-channel-id": ch, "x-goog-channel-token": "bad", "x-goog-resource-state": "exists" })).status).toBe(404);
    expect((await hit({ "x-goog-channel-id": ch, "x-goog-channel-token": "good", "x-goog-resource-state": "sync" })).status).toBe(200);
    expect(store.requestSync).not.toHaveBeenCalled();
    expect((await hit({ "x-goog-channel-id": ch, "x-goog-channel-token": "good", "x-goog-resource-state": "exists" })).status).toBe(200);
    expect(store.requestSync).toHaveBeenCalledWith("acct-1");
    expect(after).toHaveBeenCalledTimes(1);
    expect(syncAccountById).toHaveBeenCalledWith("acct-1", expect.anything());
  });

  describe("Outlook (DECISIONS.md, amendment 2026-11-15)", () => {
    const withOutlook = () => {
      vi.stubEnv("MICROSOFT_OAUTH_CLIENT_ID", "00001111-aaaa-2222-bbbb-3333cccc4444");
      vi.stubEnv("MICROSOFT_OAUTH_CLIENT_SECRET", "msecret");
    };
    const signed = (over: Record<string, unknown> = {}) => signState({ userId: "u1", purpose: "read", provider: "microsoft", next: "/settings", nonce: "n-1", exp: Math.floor(Date.now() / 1000) + 60, ...over } as Parameters<typeof signState>[0], KEY);
    const back = (query: string) => outlookCallback(req(`/api/calendar/microsoft/callback?${query}`));

    it("is not there at all without a Microsoft client: start and callback are plain 404s, signed in or not, and nothing is exchanged", async () => {
      for (const missing of ["MICROSOFT_OAUTH_CLIENT_ID", "MICROSOFT_OAUTH_CLIENT_SECRET", "CALENDAR_TOKEN_KEY"]) {
        withOutlook();
        vi.stubEnv("CALENDAR_TOKEN_KEY", KEY);
        vi.stubEnv(missing, "");
        const started = await outlookStart(req("/api/calendar/microsoft/start?next=%2Fsettings"));
        expect(started.status, missing).toBe(404);
        expect(started.headers.get("location"), missing).toBeNull();
        const returned = await back(`code=CODE&state=${encodeURIComponent(signState({ userId: "u1", purpose: "read", provider: "microsoft", next: "/settings", nonce: "n", exp: Math.floor(Date.now() / 1000) + 60 }, KEY))}`);
        expect(returned.status, missing).toBe(404);
        expect(returned.headers.get("location"), missing).toBeNull();
      }
      sessionUser = null;
      expect((await outlookStart(req("/api/calendar/microsoft/start"))).status).toBe(404);
      expect(exchangeMicrosoftCode).not.toHaveBeenCalled();
      expect(store.connect).not.toHaveBeenCalled();
    });

    it("start sends the person to Microsoft for the least it has: basic calendar reading and a refresh token, with a signed state and a PKCE challenge", async () => {
      withOutlook();
      const res = await outlookStart(req("/api/calendar/microsoft/start?next=%2Fwelcome"));
      expect(res.status).toBe(307);
      const to = new URL(res.headers.get("location")!);
      expect(to.origin + to.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
      expect(to.searchParams.get("client_id")).toBe("00001111-aaaa-2222-bbbb-3333cccc4444");
      expect(to.searchParams.get("scope")).toBe("openid email offline_access Calendars.ReadBasic");
      expect(to.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/calendar/microsoft/callback");
      expect(to.searchParams.get("response_type")).toBe("code");
      expect(to.searchParams.get("prompt")).toBe("select_account");
      expect(to.searchParams.has("login_hint")).toBe(false);
      // The state says who, for which provider, and where to go back to; the challenge belongs to its nonce.
      const state = verifyState(to.searchParams.get("state"), KEY);
      expect(state).toMatchObject({ userId: "u1", purpose: "read", provider: "microsoft", next: "/welcome" });
      expect(to.searchParams.get("code_challenge")).toBe(pkceFor(state!.nonce, KEY).challenge);
      expect(to.searchParams.get("code_challenge_method")).toBe("S256");
      // The secret never travels in the address.
      expect(res.headers.get("location")).not.toContain("msecret");
    });

    it("start without a session goes to login and comes back; a `next` off this site is not followed", async () => {
      withOutlook();
      const off = new URL((await outlookStart(req("/api/calendar/microsoft/start?next=https%3A%2F%2Fevil.example%2F"))).headers.get("location")!);
      expect(verifyState(off.searchParams.get("state"), KEY)?.next).not.toContain("evil.example");
      sessionUser = null;
      expect((await outlookStart(req("/api/calendar/microsoft/start?next=%2Fwelcome"))).headers.get("location")).toBe(`http://localhost:3000/login?next=${encodeURIComponent("/api/calendar/microsoft/start?next=%2Fwelcome")}`);
    });

    it("callback exchanges the code with the verifier for its state, seals the tokens into a microsoft account, syncs after answering, and goes back", async () => {
      withOutlook();
      const res = await back(`code=CODE&state=${encodeURIComponent(signed())}`);
      expect(res.headers.get("location")).toBe("http://localhost:3000/settings?calendar=connected");
      expect(exchangeMicrosoftCode).toHaveBeenCalledWith(expect.objectContaining({ clientId: "00001111-aaaa-2222-bbbb-3333cccc4444", redirectUri: "http://localhost:3000/api/calendar/microsoft/callback" }), "CODE", pkceFor("n-1", KEY).verifier);
      const call = store.connect.mock.calls[0] as unknown as [{ userId: string; provider: string; external: string; email: string; refreshB64: string; accessB64: string; scopes: string[]; keyVersion: number }];
      expect(call[0]).toMatchObject({ userId: "u1", provider: "microsoft", external: "ms-sub-1", email: "sam@contoso.com", scopes: ["openid", "email", "Calendars.ReadBasic"], keyVersion: 1 });
      // Sealed exactly as Google's are: the same key, never plain.
      expect(call[0].refreshB64).not.toContain("plain-ms-refresh");
      expect(call[0].accessB64).not.toContain("plain-ms-access");
      const key = Buffer.from(KEY, "base64");
      const { openFromBase64 } = await import("@/server/calendar/crypto");
      expect(openFromBase64(call[0].refreshB64, key)).toBe("AwAB.plain-ms-refresh");
      expect(openFromBase64(call[0].accessB64, key)).toBe("eyJ0.plain-ms-access");
      expect(store.resetSyncTokens).toHaveBeenCalledWith("acct-1");
      expect(after).toHaveBeenCalledTimes(1);
      expect(syncAccountById).toHaveBeenCalledWith("acct-1", expect.anything());
      // From the first run it goes back there.
      expect((await back(`code=CODE&state=${encodeURIComponent(signed({ next: "/welcome" }))}`)).headers.get("location")).toBe("http://localhost:3000/welcome?calendar=connected");
    });

    it("callback refuses a stale state, a state signed for Google's consent, and one for someone else", async () => {
      withOutlook();
      const stale = await back(`code=x&state=${encodeURIComponent(signed({ exp: 1 }))}`);
      expect(stale.headers.get("location")).toBe(`http://localhost:3000/settings?calendar=error&reason=${encodeURIComponent("That connection attempt has expired. Try again.").replace(/%20/g, "+")}`);
      const googles = signState({ userId: "u1", purpose: "read", next: "/settings", nonce: "n", exp: Math.floor(Date.now() / 1000) + 60 }, KEY);
      expect((await back(`code=x&state=${encodeURIComponent(googles)}`)).headers.get("location")).toContain("calendar=error");
      expect((await back(`code=x&state=${encodeURIComponent(signed({ userId: "u2" }))}`)).headers.get("location")).toContain("calendar=error");
      expect((await back("code=x")).headers.get("location")).toContain("calendar=error");
      expect(exchangeMicrosoftCode).not.toHaveBeenCalled();
      expect(store.connect).not.toHaveBeenCalled();
    });

    it("callback reports a no as a no, and anything else Microsoft says, a missing code or a failed exchange as an error with one plain line", async () => {
      withOutlook();
      const state = encodeURIComponent(signed({ next: "/welcome" }));
      const reason = (res: Response) => new URL(res.headers.get("location")!).searchParams;
      const denied = reason(await back(`error=access_denied&error_description=AADSTS65004&state=${state}`));
      expect([denied.get("calendar"), denied.get("reason")]).toEqual(["denied", "access_denied"]);
      const other = reason(await back(`error=server_error&error_description=AADSTS90001&state=${state}`));
      expect([other.get("calendar"), other.get("reason")]).toEqual(["error", "Microsoft didn't finish the sign-in. Try again."]);
      const empty = reason(await back(`state=${state}`));
      expect([empty.get("calendar"), empty.get("reason")]).toEqual(["error", "Microsoft did not send a code back."]);
      expect(exchangeMicrosoftCode).not.toHaveBeenCalled();

      const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
      exchangeMicrosoftCode.mockRejectedValueOnce(new Error("microsoft token: invalid_client (AADSTS7000215)"));
      const failed = reason(await back(`code=x&state=${state}`));
      expect([failed.get("calendar"), failed.get("reason")]).toEqual(["error", "Outlook didn't answer. Try again."]);
      quiet.mockRestore();
      exchangeMicrosoftCode.mockResolvedValueOnce({ accessToken: "at", refreshToken: "rt", expiresAt: new Date("2026-11-15T11:00:00Z"), scopes: [], sub: null, email: null });
      const nobody = reason(await back(`code=x&state=${state}`));
      expect([nobody.get("calendar"), nobody.get("reason")]).toEqual(["error", "Microsoft did not say which account this is."]);
      expect(store.connect).not.toHaveBeenCalled();
    });
  });
});
