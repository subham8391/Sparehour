// Connecting a calendar from the phone app (server/calendar/app-connect.ts): app-start → the provider → the
// callback's sealed ticket → app-finish. The outside ports are mocked as in routes.test.ts (the store, Google,
// Microsoft, Next's after()); the caller is not: `requestUser` runs for real over a fake auth server, so "who is
// calling" is decided by the code that decides it in production. The web's own cookie flow is routes.test.ts,
// which this work leaves passing as it was.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sealToBase64 } from "@/server/calendar/crypto";
import { NeedsReauth } from "@/server/calendar/provider";
import { STATE_TTL_SECONDS, pkceFor, signState, verifyState } from "@/server/calendar/state";
import { openTicket, sealTicket } from "@/server/calendar/ticket";

const KEY = Buffer.alloc(32, 7).toString("base64");
const KEY_BYTES = Buffer.from(KEY, "base64");
const sam = { id: "u1", email: "sam@example.com" };
const ali = { id: "u2", email: "ali@example.com" };
/** Who the browser's cookie says is signed in, where a test wants one. */
let sessionUser: { id: string; email: string } | null = null;

vi.mock("@/server/auth/supabase", () => ({
  createUserScopedClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
  serviceRoleClient: () => ({}),
}));

// A sign-in token as the auth server issues it: the claims in the middle part. `requestUser` reads `client_id` from
// it itself and asks the auth server (this fake) about everything else.
const token = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const bearer = (t: string) => ({ authorization: `Bearer ${t}`, "content-type": "application/json" });
const SAM = token({ sub: "u1" });
const ALI = token({ sub: "u2" });
/** A token of an app Sam connected over MCP: his own, with a `client_id`. */
const SAMS_APP = token({ sub: "u1", client_id: "claude" });
/** A token the auth server does not know (revoked, forged, expired). */
const UNKNOWN = token({ sub: "u1", revoked: true });

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (t: string) => {
        let claims: { sub?: string; revoked?: boolean } = {};
        try {
          claims = JSON.parse(Buffer.from(t.split(".")[1] ?? "", "base64url").toString("utf8")) as typeof claims;
        } catch {
          // not a token at all
        }
        const user = claims.revoked ? null : claims.sub === "u1" ? sam : claims.sub === "u2" ? ali : null;
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
      },
    },
  }),
}));

const { store, after, syncAccountById, exchangeCode, exchangeMicrosoftCode } = vi.hoisted(() => ({
  store: {
    connect: vi.fn(async () => "acct-1"),
    resetSyncTokens: vi.fn(async () => undefined),
  },
  after: vi.fn((cb: () => Promise<void> | void) => void cb()),
  syncAccountById: vi.fn(async () => ({ status: "ok", calendars: 1, events: 2, error: null })),
  exchangeCode: vi.fn(async () => ({
    accessToken: "ya29.plain-access",
    refreshToken: "1//plain-refresh" as string | null,
    expiresAt: new Date("2026-11-22T11:00:00Z"),
    scopes: ["openid", "email", "https://www.googleapis.com/auth/calendar.calendarlist.readonly", "https://www.googleapis.com/auth/calendar.events.freebusy"],
    sub: "g-1" as string | null,
    email: "sam@gmail.com" as string | null,
  })),
  exchangeMicrosoftCode: vi.fn(async () => ({
    accessToken: "eyJ0.plain-ms-access",
    refreshToken: "AwAB.plain-ms-refresh" as string | null,
    expiresAt: new Date("2026-11-22T11:00:00Z"),
    scopes: ["openid", "email", "Calendars.ReadBasic"],
    sub: "ms-sub-1" as string | null,
    email: "sam@contoso.com" as string | null,
  })),
}));
vi.mock("@/server/calendar/store", () => ({
  SupabaseAccountStore: function FakeStore() {
    return store;
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after }));
vi.mock("@/server/calendar/run", () => ({ buildDeps: () => ({ store }), syncAccountById }));
vi.mock("@/server/calendar/google", async (orig) => ({ ...(await orig<typeof import("@/server/calendar/google")>()), exchangeCode }));
vi.mock("@/server/calendar/microsoft", async (orig) => ({ ...(await orig<typeof import("@/server/calendar/microsoft")>()), exchangeCode: exchangeMicrosoftCode }));

import { GET as config } from "./config/route";
import { POST as finish } from "./google/app-finish/route";
import { POST as start } from "./google/app-start/route";
import { GET as callback } from "./google/callback/route";
import { POST as outlookFinish } from "./microsoft/app-finish/route";
import { POST as outlookStart } from "./microsoft/app-start/route";
import { GET as outlookCallback } from "./microsoft/callback/route";

// Spelled out, not imported: if the constant ever changes, this fails and the app's registered scheme is checked with it.
const APP_LINK = "sparehour://calendar-connected";
const req = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`http://localhost:3000${path}`, init);
const post = (path: string, who: string | null, body?: unknown) => req(path, { method: "POST", headers: who ? bearer(who) : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const startGoogle = (who: string | null, body: unknown = { purpose: "read" }) => start(post("/api/calendar/google/app-start", who, body));
const finishGoogle = (who: string | null, ticket: unknown) => finish(post("/api/calendar/google/app-finish", who, { ticket }));
const startOutlook = (who: string | null, body: unknown = { purpose: "read" }) => outlookStart(post("/api/calendar/microsoft/app-start", who, body));
const finishOutlook = (who: string | null, ticket: unknown) => outlookFinish(post("/api/calendar/microsoft/app-finish", who, { ticket }));

/** The state in the consent address app-start answered with. */
async function stateFrom(res: Response): Promise<string> {
  const { url } = (await res.json()) as { url: string };
  return new URL(url).searchParams.get("state")!;
}
/** Where the callback sent the browser, in parts. */
function landed(res: Response): { link: string; params: URLSearchParams } {
  const location = res.headers.get("location")!;
  const [link, query = ""] = location.split("?");
  return { link, params: new URLSearchParams(query) };
}
/** The whole round for Google up to the ticket: start as `who`, come back from Google with `code`. */
async function googleTicket(who: string, code = "CODE", purpose = "read"): Promise<string> {
  const state = await stateFrom(await startGoogle(who, { purpose }));
  const back = landed(await callback(req(`/api/calendar/google/callback?code=${code}&state=${encodeURIComponent(state)}`)));
  expect(back.link).toBe(APP_LINK);
  return back.params.get("ticket")!;
}
async function outlookTicket(who: string, code = "MSCODE"): Promise<{ ticket: string; state: string }> {
  const state = await stateFrom(await startOutlook(who));
  const back = landed(await outlookCallback(req(`/api/calendar/microsoft/callback?code=${code}&state=${encodeURIComponent(state)}`)));
  expect(back.link).toBe(APP_LINK);
  return { ticket: back.params.get("ticket")!, state };
}
const nothingHappened = () => {
  expect(exchangeCode).not.toHaveBeenCalled();
  expect(exchangeMicrosoftCode).not.toHaveBeenCalled();
  expect(store.connect).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
};

describe("connecting a calendar from the phone app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUser = null;
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_ID", "00001111-aaaa-2222-bbbb-3333cccc4444");
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_SECRET", "msecret");
    vi.stubEnv("CALENDAR_TOKEN_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  describe("who may call", () => {
    it("no bearer → 401 on every app route, even where the browser's cookie says the very person is signed in", async () => {
      const ticket = await googleTicket(SAM);
      const { ticket: msTicket } = await outlookTicket(SAM);
      vi.clearAllMocks();
      sessionUser = sam; // a cookie session is the web's way in, not these routes'
      for (const res of [await startGoogle(null), await finishGoogle(null, ticket), await startOutlook(null), await finishOutlook(null, msTicket)]) {
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: "unauthenticated" });
      }
      nothingHappened();
    });

    it("a token the auth server does not know, and the token of an app the person connected, are nobody", async () => {
      const ticket = await googleTicket(SAM);
      vi.clearAllMocks();
      for (const who of [UNKNOWN, SAMS_APP, "not-a-token"]) {
        expect((await startGoogle(who)).status, who).toBe(401);
        expect((await finishGoogle(who, ticket)).status, who).toBe(401);
        expect((await startOutlook(who)).status, who).toBe(401);
      }
      nothingHappened();
    });

    it("config answers the phone's token as it answers the browser's cookie, and nobody else", async () => {
      const asked = (headers?: Record<string, string>) => config(req("/api/calendar/config", { headers }));
      expect(await (await asked(bearer(SAM))).json()).toEqual({ google: true, microsoft: true });
      expect((await asked(bearer(SAMS_APP))).status).toBe(401);
      expect((await asked(bearer(UNKNOWN))).status).toBe(401);
      expect((await asked()).status).toBe(401);
      sessionUser = sam;
      expect(await (await asked()).json()).toEqual({ google: true, microsoft: true });
    });
  });

  describe("app-start", () => {
    it("answers Google's consent address for the caller: the web's scopes for the purpose, this server's callback, a state that names them and says it came from the app", async () => {
      const before = Math.floor(Date.now() / 1000);
      const res = await startGoogle(SAM, { purpose: "read" });
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const to = new URL(((await res.json()) as { url: string }).url);
      expect(to.origin + to.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(to.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.freebusy");
      expect(to.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/calendar/google/callback");
      expect(to.searchParams.get("login_hint")).toBe("sam@example.com");
      const state = verifyState(to.searchParams.get("state"), KEY)!;
      expect(state).toMatchObject({ userId: "u1", purpose: "read", provider: "google", app: true });
      expect(state.nonce).toMatch(/^[0-9a-f-]{36}$/);
      expect(state.exp).toBeGreaterThanOrEqual(before + STATE_TTL_SECONDS);
      expect(state.exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS);

      const scopeOf = async (purpose: string) => new URL(((await (await startGoogle(SAM, { purpose })).json()) as { url: string }).url).searchParams.get("scope")!;
      expect(await scopeOf("write")).toContain("calendar.app.created");
      expect(await scopeOf("write")).not.toContain("events.owned");
      expect(await scopeOf("full")).toContain("calendar.events.readonly");
      expect(await scopeOf("full")).toContain("calendar.events.owned");
      // Anything else is the plain connect, never more.
      expect(await scopeOf("everything")).toBe(await scopeOf("read"));
    });

    it("takes nothing from the caller but the purpose: no redirect target, no other person, with or without a body", async () => {
      const res = await startGoogle(SAM, { purpose: "read", userId: "u2", next: "https://evil.example/", redirect: "evil://take", redirect_uri: "https://evil.example/cb", app: false, provider: "microsoft" });
      const { url } = (await res.json()) as { url: string };
      expect(url).not.toContain("evil");
      const state = verifyState(new URL(url).searchParams.get("state"), KEY)!;
      expect(state).toMatchObject({ userId: "u1", provider: "google", app: true, next: "/settings" });
      expect(new URL(url).searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/calendar/google/callback");
      // No body, or one that is not an object, is the plain connect.
      for (const body of [undefined, "write", ["full"], null]) {
        const plain = await startGoogle(SAM, body);
        expect(plain.status).toBe(200);
        expect(verifyState(await stateFrom(plain), KEY)).toMatchObject({ userId: "u1", purpose: "read", app: true });
      }
    });

    it("says so where this server cannot connect Google", async () => {
      vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
      const res = await startGoogle(SAM);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "unavailable" });
      expect((await finishGoogle(SAM, "anything")).status).toBe(503);
    });
  });

  describe("the callback, for a consent started in the app", () => {
    it("exchanges nothing and saves nothing, whoever's cookie the browser holds: the code goes to the app's own link, sealed", async () => {
      const state = await stateFrom(await startGoogle(SAM));
      for (const inBrowser of [null, sam, ali]) {
        sessionUser = inBrowser;
        const res = await callback(req(`/api/calendar/google/callback?code=4/0AX-secret-code&state=${encodeURIComponent(state)}`));
        expect(res.status).toBe(307);
        expect(res.headers.get("cache-control")).toBe("no-store");
        const back = landed(res);
        expect(back.link).toBe(APP_LINK);
        expect([...back.params.keys()]).toEqual(["ticket"]);
        const ticket = back.params.get("ticket")!;
        expect(ticket).toMatch(/^[A-Za-z0-9_-]+$/);
        // Sealed: neither the code nor the state can be read off the link.
        expect(res.headers.get("location")).not.toContain("secret-code");
        expect(Buffer.from(ticket, "base64url").toString("latin1")).not.toContain("secret-code");
        expect(res.headers.get("location")).not.toContain(state.split(".")[0]);
        expect(openTicket(ticket, KEY_BYTES)).toEqual({ code: "4/0AX-secret-code", state });
      }
      nothingHappened();
    });

    it("reports a no as a no and everything else as 'try again', to the same constant link and with none of the provider's words", async () => {
      const state = encodeURIComponent(await stateFrom(await startGoogle(SAM)));
      const at = async (query: string) => (await callback(req(`/api/calendar/google/callback?${query}`))).headers.get("location");
      expect(await at(`error=access_denied&state=${state}`)).toBe(`${APP_LINK}?error=denied`);
      expect(await at(`error=server_error&error_description=evil%3A%2F%2Ftake&state=${state}`)).toBe(`${APP_LINK}?error=failed`);
      expect(await at(`state=${state}`)).toBe(`${APP_LINK}?error=failed`);
      // An error wins over a code that came with it.
      expect(await at(`error=access_denied&code=CODE&state=${state}`)).toBe(`${APP_LINK}?error=denied`);
      const ms = encodeURIComponent(await stateFrom(await startOutlook(SAM)));
      const msAt = async (query: string) => (await outlookCallback(req(`/api/calendar/microsoft/callback?${query}`))).headers.get("location");
      expect(await msAt(`error=access_denied&error_description=AADSTS65004&state=${ms}`)).toBe(`${APP_LINK}?error=denied`);
      expect(await msAt(`error=server_error&state=${ms}`)).toBe(`${APP_LINK}?error=failed`);
      expect(await msAt(`state=${ms}`)).toBe(`${APP_LINK}?error=failed`);
      nothingHappened();
    });

    it("gives an expired attempt no ticket, and sends it back to the app rather than to a web page", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const state = encodeURIComponent(await stateFrom(await startGoogle(SAM)));
      vi.setSystemTime(Date.now() + (STATE_TTL_SECONDS + 1) * 1000);
      expect((await callback(req(`/api/calendar/google/callback?code=CODE&state=${state}`))).headers.get("location")).toBe(`${APP_LINK}?error=failed`);
      nothingHappened();
    });

    it("does not take 'this came from the app' on anyone's word: a state that is not signed gets the web's refusal, and no ticket", async () => {
      const state = await stateFrom(await startGoogle(SAM));
      const forged = `${Buffer.from(JSON.stringify({ userId: "u2", purpose: "read", provider: "google", next: "/settings", nonce: "n", exp: Math.floor(Date.now() / 1000) + 60, app: true })).toString("base64url")}.${state.split(".")[1]}`;
      sessionUser = ali;
      const where = (await callback(req(`/api/calendar/google/callback?code=CODE&state=${encodeURIComponent(forged)}`))).headers.get("location")!;
      expect(where.startsWith("http://localhost:3000/settings?calendar=error")).toBe(true);
      expect(where).not.toContain("ticket");
      nothingHappened();
    });

    it("keeps each provider's state to its own callback", async () => {
      const google = encodeURIComponent(await stateFrom(await startGoogle(SAM)));
      const outlook = encodeURIComponent(await stateFrom(await startOutlook(SAM)));
      expect((await outlookCallback(req(`/api/calendar/microsoft/callback?code=CODE&state=${google}`))).headers.get("location")).toBe(`${APP_LINK}?error=failed`);
      expect((await callback(req(`/api/calendar/google/callback?code=CODE&state=${outlook}`))).headers.get("location")).toBe(`${APP_LINK}?error=failed`);
      nothingHappened();
    });

    it("makes no ticket where the server has no key, when a state is something anyone could sign", async () => {
      vi.stubEnv("CALENDAR_TOKEN_KEY", "");
      const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const anyones = signState({ userId: "u1", purpose: "read", provider: "google", next: "/settings", nonce: "n", exp: Math.floor(Date.now() / 1000) + 60, app: true }, "");
      expect((await callback(req(`/api/calendar/google/callback?code=CODE&state=${encodeURIComponent(anyones)}`))).headers.get("location")).toBe(`${APP_LINK}?error=failed`);
      quiet.mockRestore();
      nothingHappened();
    });

    it("leaves the web's consent as it was: a state without the app's mark still needs the cookie of the person it names", async () => {
      const web = encodeURIComponent(signState({ userId: "u1", purpose: "read", next: "/settings", nonce: "n", exp: Math.floor(Date.now() / 1000) + 60 }, KEY));
      expect((await callback(req(`/api/calendar/google/callback?code=CODE&state=${web}`))).headers.get("location")).toContain("http://localhost:3000/settings?calendar=error");
      nothingHappened();
      sessionUser = sam;
      expect((await callback(req(`/api/calendar/google/callback?code=CODE&state=${web}`))).headers.get("location")).toBe("http://localhost:3000/settings?calendar=connected");
      expect(store.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe("app-finish", () => {
    it("for the person who started it: exchanges the code, seals the tokens into their account, syncs after answering", async () => {
      const ticket = await googleTicket(SAM, "CODE");
      nothingHappened(); // up to here nothing has been exchanged or saved
      const res = await finishGoogle(SAM, ticket);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ outcome: "connected" });
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(exchangeCode).toHaveBeenCalledTimes(1);
      expect(exchangeCode).toHaveBeenCalledWith(expect.objectContaining({ clientId: "cid", redirectUri: "http://localhost:3000/api/calendar/google/callback" }), "CODE");
      const saved = (store.connect.mock.calls[0] as unknown as [{ userId: string; provider: string; external: string; email: string; refreshB64: string; accessB64: string }])[0];
      expect(saved).toMatchObject({ userId: "u1", provider: "google", external: "g-1", email: "sam@gmail.com" });
      expect(saved.refreshB64).not.toContain("plain-refresh");
      expect(saved.accessB64).not.toContain("plain-access");
      expect(store.resetSyncTokens).toHaveBeenCalledWith("acct-1");
      expect(after).toHaveBeenCalledTimes(1);
      expect(syncAccountById).toHaveBeenCalledWith("acct-1", expect.anything());
    });

    it("says what came of it in the web's own words", async () => {
      // Write asked for, only busy times granted.
      expect(await (await finishGoogle(SAM, await googleTicket(SAM, "C1", "write"))).json()).toEqual({ outcome: "read_only" });
      // Full asked for, titles not granted.
      expect(await (await finishGoogle(SAM, await googleTicket(SAM, "C2", "full"))).json()).toEqual({ outcome: "full_denied" });
      exchangeCode.mockResolvedValueOnce({ accessToken: "at", refreshToken: "rt", expiresAt: new Date("2026-11-22T11:00:00Z"), scopes: ["openid", "email", "https://www.googleapis.com/auth/calendar.events.readonly", "https://www.googleapis.com/auth/calendar.events.owned"], sub: "g-1", email: "sam@gmail.com" });
      expect(await (await finishGoogle(SAM, await googleTicket(SAM, "C3", "full"))).json()).toEqual({ outcome: "full" });
      // The busy-times box unticked on Google's screen.
      exchangeCode.mockResolvedValueOnce({ accessToken: "at", refreshToken: "rt", expiresAt: new Date("2026-11-22T11:00:00Z"), scopes: ["openid", "email"], sub: "g-1", email: "sam@gmail.com" });
      expect(await (await finishGoogle(SAM, await googleTicket(SAM, "C4"))).json()).toEqual({ outcome: "no_read" });
    });

    it("another person's bearer → refused: a ticket that leaked connects nothing to anyone", async () => {
      const ticket = await googleTicket(SAM);
      const res = await finishGoogle(ALI, ticket);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden" });
      const { ticket: msTicket } = await outlookTicket(SAM);
      expect((await finishOutlook(ALI, msTicket)).status).toBe(403);
      nothingHappened();
      // And it is still good for the person it belongs to.
      expect((await finishGoogle(SAM, ticket)).status).toBe(200);
      expect((store.connect.mock.calls[0] as unknown as [{ userId: string }])[0].userId).toBe("u1");
    });

    it("an expired ticket → refused, though the same ticket was good a moment before it ran out", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const ticket = await googleTicket(SAM);
      vi.setSystemTime(Date.now() + (STATE_TTL_SECONDS + 1) * 1000);
      const res = await finishGoogle(SAM, ticket);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_ticket" });
      nothingHappened();
    });

    it("a tampered, cut, foreign or made-up ticket → refused", async () => {
      const ticket = await googleTicket(SAM);
      const flip = (s: string, i: number) => `${s.slice(0, i)}${s[i] === "A" ? "B" : "A"}${s.slice(i + 1)}`;
      const state = openTicket(ticket, KEY_BYTES)!.state;
      const bad: unknown[] = [
        flip(ticket, 2), // the IV
        flip(ticket, Math.floor(ticket.length / 2)), // the body
        flip(ticket, ticket.length - 3), // the tag
        ticket.slice(0, -8),
        ticket.slice(8),
        `${ticket}${ticket}`,
        // Sealed by someone with another key.
        sealTicket({ code: "CODE", state }, Buffer.alloc(32, 9)),
        // Sealed with the token key itself, as a stored token is: a ticket has its own key.
        sealToBase64(JSON.stringify({ v: 1, code: "CODE", state }), KEY_BYTES),
        Buffer.from(JSON.stringify({ v: 1, code: "CODE", state })).toString("base64url"),
        state, // the state alone is not a ticket
        "",
        "x".repeat(9000),
        null,
        undefined,
        42,
        { ticket },
        [ticket],
      ];
      for (const t of bad) {
        const res = await finishGoogle(SAM, t);
        expect(res.status, String(t).slice(0, 24)).toBe(400);
        expect(await res.json()).toEqual({ error: "invalid_ticket" });
      }
      // A body that is not JSON at all.
      expect((await finish(req("/api/calendar/google/app-finish", { method: "POST", headers: bearer(SAM), body: "ticket=" + ticket }))).status).toBe(400);
      expect((await finish(req("/api/calendar/google/app-finish", { method: "POST", headers: bearer(SAM) }))).status).toBe(400);
      nothingHappened();
    });

    it("a sealed ticket is still only as good as the state inside it: the web's state, another provider's, a changed one, someone else's", async () => {
      const exp = Math.floor(Date.now() / 1000) + 60;
      const seal = (state: string) => sealTicket({ code: "CODE", state }, KEY_BYTES);
      // A state the web's start signed (no app mark) cannot be finished with a bearer.
      const web = signState({ userId: "u1", purpose: "read", next: "/settings", nonce: "n", exp }, KEY);
      expect((await finishGoogle(SAM, seal(web))).status).toBe(400);
      const webGoogle = signState({ userId: "u1", purpose: "read", provider: "google", next: "/settings", nonce: "n", exp }, KEY);
      expect((await finishGoogle(SAM, seal(webGoogle))).status).toBe(400);
      // A state signed for Outlook's consent, handed to Google's finish.
      const outlook = signState({ userId: "u1", purpose: "read", provider: "microsoft", next: "/settings", nonce: "n", exp, app: true }, KEY);
      expect((await finishGoogle(SAM, seal(outlook))).status).toBe(400);
      // A state whose signature does not hold.
      const good = signState({ userId: "u1", purpose: "read", provider: "google", next: "/settings", nonce: "n", exp, app: true }, KEY);
      expect((await finishGoogle(SAM, seal(`${good}x`))).status).toBe(400);
      expect((await finishGoogle(SAM, seal(signState({ userId: "u1", purpose: "read", provider: "google", next: "/settings", nonce: "n", exp, app: true }, "another-secret")))).status).toBe(400);
      // Expired inside a ticket that opens.
      expect((await finishGoogle(SAM, seal(signState({ userId: "u1", purpose: "read", provider: "google", next: "/settings", nonce: "n", exp: 1, app: true }, KEY)))).status).toBe(400);
      nothingHappened();
      expect((await finishGoogle(SAM, seal(good))).status).toBe(200);
    });

    it("replay of a used code fails closed: the provider refuses it, nothing more is saved, and the answer is an error", async () => {
      const ticket = await googleTicket(SAM);
      expect((await finishGoogle(SAM, ticket)).status).toBe(200);
      expect(store.connect).toHaveBeenCalledTimes(1);
      // Google redeems a code once; the second time it answers invalid_grant.
      exchangeCode.mockRejectedValueOnce(new NeedsReauth("invalid_grant"));
      const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const again = await finishGoogle(SAM, ticket);
      quiet.mockRestore();
      expect(again.status).toBe(502);
      expect(await again.json()).toEqual({ error: "provider", reason: "Google didn't answer. Try again." });
      expect(store.connect).toHaveBeenCalledTimes(1);
      expect(store.resetSyncTokens).toHaveBeenCalledTimes(1);
      expect(after).toHaveBeenCalledTimes(1);
      // Replayed by someone else, it does not even reach the provider.
      expect((await finishGoogle(ALI, ticket)).status).toBe(403);
      expect(exchangeCode).toHaveBeenCalledTimes(2);
    });

    it("saves nothing when the provider does not answer or does not say whose account it is", async () => {
      const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
      exchangeCode.mockRejectedValueOnce(new Error("google token: 500"));
      expect((await finishGoogle(SAM, await googleTicket(SAM))).status).toBe(502);
      exchangeCode.mockResolvedValueOnce({ accessToken: "at", refreshToken: "rt", expiresAt: new Date("2026-11-22T11:00:00Z"), scopes: [], sub: null, email: null });
      const nobody = await finishGoogle(SAM, await googleTicket(SAM));
      expect(nobody.status).toBe(502);
      expect(await nobody.json()).toEqual({ error: "provider", reason: "Google did not say which account this is." });
      quiet.mockRestore();
      expect(store.connect).not.toHaveBeenCalled();
      expect(after).not.toHaveBeenCalled();
    });
  });

  describe("Outlook from the app (read only: DECISIONS.md, amendment 2026-11-15)", () => {
    it("is not there at all without a Microsoft app registration, bearer or not", async () => {
      const { ticket } = await outlookTicket(SAM);
      vi.clearAllMocks();
      vi.stubEnv("MICROSOFT_OAUTH_CLIENT_SECRET", "");
      for (const who of [SAM, null]) {
        expect((await startOutlook(who)).status).toBe(404);
        expect((await finishOutlook(who, ticket)).status).toBe(404);
      }
      nothingHappened();
    });

    it("asks Microsoft for reading and nothing else, whatever purpose the app sends: an Outlook account never reaches a write path", async () => {
      for (const purpose of ["read", "write", "full", "everything"]) {
        const res = await startOutlook(SAM, { purpose });
        const to = new URL(((await res.json()) as { url: string }).url);
        expect(to.origin + to.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
        expect(to.searchParams.get("scope"), purpose).toBe("openid email offline_access Calendars.ReadBasic");
        expect(to.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/calendar/microsoft/callback");
        const state = verifyState(to.searchParams.get("state"), KEY)!;
        expect(state, purpose).toMatchObject({ userId: "u1", purpose: "read", provider: "microsoft", app: true });
        expect(to.searchParams.get("code_challenge")).toBe(pkceFor(state.nonce, KEY).challenge);
        expect(to.searchParams.get("code_challenge_method")).toBe("S256");
        expect(res.headers.get("cache-control")).toBe("no-store");
      }
    });

    it("finishes as a microsoft account with the verifier for its own state; Google is never handed the code", async () => {
      const { ticket, state } = await outlookTicket(SAM, "MSCODE");
      nothingHappened();
      const res = await finishOutlook(SAM, ticket);
      expect(await res.json()).toEqual({ outcome: "connected" });
      const nonce = verifyState(state, KEY)!.nonce;
      expect(exchangeMicrosoftCode).toHaveBeenCalledWith(expect.objectContaining({ clientId: "00001111-aaaa-2222-bbbb-3333cccc4444", redirectUri: "http://localhost:3000/api/calendar/microsoft/callback" }), "MSCODE", pkceFor(nonce, KEY).verifier);
      expect(exchangeCode).not.toHaveBeenCalled();
      const saved = (store.connect.mock.calls[0] as unknown as [{ userId: string; provider: string; external: string; scopes: string[]; refreshB64: string }])[0];
      expect(saved).toMatchObject({ userId: "u1", provider: "microsoft", external: "ms-sub-1", scopes: ["openid", "email", "Calendars.ReadBasic"] });
      expect(saved.refreshB64).not.toContain("plain-ms-refresh");
      expect(after).toHaveBeenCalledTimes(1);
    });

    it("a ticket is good at its own provider's finish only: an Outlook consent cannot be saved as a Google account (which may be written to), nor the other way", async () => {
      const { ticket: outlook } = await outlookTicket(SAM);
      const google = await googleTicket(SAM);
      expect((await finishGoogle(SAM, outlook)).status).toBe(400);
      expect((await finishOutlook(SAM, google)).status).toBe(400);
      nothingHappened();
    });
  });
});
