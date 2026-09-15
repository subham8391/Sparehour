// The calendar routes with every outside port mocked: the session, the
// service-role store, Google, and Next's after().
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sealToBase64 } from "@/server/calendar/crypto";
import { signState } from "@/server/calendar/state";

const KEY = Buffer.alloc(32, 7).toString("base64");
const user = { id: "u1", email: "sam@example.com" };
let sessionUser: { id: string; email: string } | null = user;

vi.mock("@/server/auth/supabase", () => ({
  createUserScopedClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
  serviceRoleClient: () => ({}),
}));

// vi.mock is hoisted above every other statement, so the handles it closes over must be too.
const { store, after, syncAccountById, syncUser, syncDue, pushUser, pushDue, exchangeCode, revokeToken } = vi.hoisted(() => ({
  store: {
    connect: vi.fn(async () => "acct-1"),
    claim: vi.fn(async () => []),
    requestSync: vi.fn(async () => undefined),
    channelAccount: vi.fn<(id: string, token: string) => Promise<string | null>>(async (_, token) => (token === "good" ? "acct-1" : null)),
    disconnect: vi.fn<(id: string, user: string) => Promise<string | null>>(async () => "sealed"),
  },
  after: vi.fn((cb: () => Promise<void> | void) => void cb()),
  syncAccountById: vi.fn(async () => ({ status: "ok", calendars: 1, events: 2, error: null })),
  syncUser: vi.fn(async () => ({ "acct-1": { status: "ok", calendars: 1, events: 2, error: null } })),
  syncDue: vi.fn(async () => ({})),
  pushUser: vi.fn(async () => ({ written: 1, deleted: 0, adopted: 0, failed: 0 })),
  pushDue: vi.fn(async () => ({ written: 0, deleted: 0, adopted: 0, failed: 0 })),
  exchangeCode: vi.fn(async () => ({
    accessToken: "at",
    refreshToken: "rt",
    expiresAt: new Date("2026-09-15T11:00:00Z"),
    scopes: ["openid", "email", "https://www.googleapis.com/auth/calendar.events.readonly"],
    sub: "g-1",
    email: "sam@gmail.com",
  })),
  revokeToken: vi.fn(async () => undefined),
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

import { GET as config } from "./config/route";
import { POST as disconnect } from "./disconnect/route";
import { GET as callback } from "./google/callback/route";
import { GET as start } from "./google/start/route";
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
    vi.stubEnv("CALENDAR_TOKEN_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("PUSH_TICK_SECRET", "jobs");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("config says whether Google is set up, to signed-in people only", async () => {
    expect(await (await config()).json()).toEqual({ google: true });
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    expect(await (await config()).json()).toEqual({ google: false });
    sessionUser = null;
    expect((await config()).status).toBe(401);
  });

  it("start sends the person to Google with read scopes, offline access, a signed state and the callback", async () => {
    const res = await start(req("/api/calendar/google/start?next=%2Fsettings"));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(to.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly");
    expect(to.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/calendar/google/callback");
    expect(to.searchParams.get("login_hint")).toBe("sam@example.com");
    expect(to.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const write = new URL((await start(req("/api/calendar/google/start?purpose=write"))).headers.get("location")!);
    expect(write.searchParams.get("scope")).toContain("calendar.events.owned");
    const fallback = new URL((await start(req("/api/calendar/google/start?purpose=write&fallback=1"))).headers.get("location")!);
    expect(fallback.searchParams.get("scope")).toContain("calendar.app.created");
    expect(fallback.searchParams.get("scope")).not.toContain("events.owned");
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
    expect(call[0].refreshB64).not.toContain("rt"); // sealed, never plain
    expect(call[0].accessB64).not.toContain("at");
    expect(after).toHaveBeenCalledTimes(1);
    expect(syncAccountById).toHaveBeenCalledWith("acct-1", "u1", expect.anything());
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

  it("sync now runs every account of the signed-in person", async () => {
    const res = await sync();
    expect(await res.json()).toEqual({ accounts: 1, report: { "acct-1": { status: "ok", calendars: 1, events: 2, error: null } }, push: { written: 1, deleted: 0, adopted: 0, failed: 0 } });
    expect(syncUser).toHaveBeenCalledWith("u1");
    expect(pushUser).toHaveBeenCalledWith("u1");
    sessionUser = null;
    expect((await sync()).status).toBe(401);
  });

  it("the tick needs the jobs secret and syncs what is due", async () => {
    expect((await tick(req("/api/calendar/tick", { method: "POST" }))).status).toBe(403);
    const ok = await tick(req("/api/calendar/tick", { method: "POST", headers: { "x-push-secret": "jobs" } }));
    expect(ok.status).toBe(200);
    expect(syncDue).toHaveBeenCalledWith(10);
    expect(pushDue).toHaveBeenCalledTimes(1);
  });

  it("push writes the signed-in person's pending blocks, and says so when the calendar is not set up", async () => {
    expect(await (await push()).json()).toEqual({ written: 1, deleted: 0, adopted: 0, failed: 0 });
    expect(pushUser).toHaveBeenCalledWith("u1");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "");
    expect(await (await push()).json()).toMatchObject({ skipped: "calendar_not_configured" });
    sessionUser = null;
    expect((await push()).status).toBe(401);
  });

  it("disconnect drops the account for its owner and revokes the grant", async () => {
    store.disconnect.mockResolvedValueOnce(sealToBase64("rt", Buffer.from(KEY, "base64")));
    const res = await disconnect(req("/api/calendar/disconnect", { method: "POST", body: JSON.stringify({ id: "acct-1" }), headers: { "content-type": "application/json" } }));
    expect(await res.json()).toEqual({ ok: true });
    expect(store.disconnect).toHaveBeenCalledWith("acct-1", "u1");
    expect(revokeToken).toHaveBeenCalledWith("rt");
    store.disconnect.mockResolvedValueOnce(null);
    expect((await disconnect(req("/api/calendar/disconnect", { method: "POST", body: JSON.stringify({ id: "nope" }) }))).status).toBe(404);
  });

  it("the webhook checks the channel token, ignores the first sync message, and otherwise asks for a sync", async () => {
    const hit = (headers: Record<string, string>) => webhook(req("/api/webhooks/google-calendar", { method: "POST", headers }));
    expect((await hit({ "x-goog-channel-id": "ch", "x-goog-channel-token": "bad", "x-goog-resource-state": "exists" })).status).toBe(404);
    expect((await hit({ "x-goog-channel-id": "ch", "x-goog-channel-token": "good", "x-goog-resource-state": "sync" })).status).toBe(200);
    expect(store.requestSync).not.toHaveBeenCalled();
    expect((await hit({ "x-goog-channel-id": "ch", "x-goog-channel-token": "good", "x-goog-resource-state": "exists" })).status).toBe(200);
    expect(store.requestSync).toHaveBeenCalledWith("acct-1");
    expect(after).toHaveBeenCalledTimes(1);
  });
});
