// The wiring (run.ts): the account's `provider` picks whose client and whose token refresh the worker gets, a
// provider this server has no client for is simply not there, and blocks are never written to Outlook. The last
// test runs a whole pass for an Outlook account through the real Graph client over a fake fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/supabase", () => ({ serviceRoleClient: () => ({}) }));

import { syncAccount, type CalendarRow, type CalendarUpsert, type ClaimedAccount } from "./account-sync";
import { openFromBase64, sealToBase64 } from "./crypto";
import { GoogleCalendar } from "./google";
import { MicrosoftCalendar, readSyncToken } from "./microsoft";
import type { ProviderEvent } from "./provider";
import { buildDeps, providerWiring, wiringFor, writerFor } from "./run";
import type { SupabaseAccountStore } from "./store";
import type { CalendarRef } from "./sync";

const KEY_B64 = Buffer.alloc(32, 9).toString("base64");
const key = Buffer.from(KEY_B64, "base64");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const account = (over: Partial<ClaimedAccount> = {}): ClaimedAccount => ({
  id: "acct",
  user_id: "u1",
  space_id: "s1",
  provider: "microsoft",
  external_account: "ms-sub",
  email: "sam@contoso.com",
  refresh_b64: sealToBase64("RT1", key),
  access_b64: null,
  token_expires_at: null,
  scopes: ["openid", "email", "Calendars.ReadBasic"],
  key_version: 1,
  status: "ok",
  ...over,
});

/** The store as the worker and the block writer use it, in memory. */
function memoryStore(claimed: ClaimedAccount[] = []) {
  let rows: CalendarRow[] = [];
  const mirror = new Map<string, ProviderEvent>();
  const log: string[] = [];
  const store = {
    claim: vi.fn(async () => claimed),
    release: vi.fn(async () => undefined),
    saveTokens: vi.fn(async (_id: string, access: string, _exp: Date, refresh?: string | null) => void log.push(`tokens access=${openFromBase64(access, key)} refresh=${refresh ? openFromBase64(refresh, key) : "kept"}`)),
    finish: vi.fn(async (_id: string, status: string, error: string | null) => void log.push(`finish ${status}${error ? ` (${error})` : ""}`)),
    calendarsOf: vi.fn(async () => rows),
    upsertCalendars: vi.fn(async (ups: CalendarUpsert[]) => {
      for (const u of ups) if (!rows.some((r) => r.external_id === u.external_id)) rows.push({ id: `id-${u.external_id}`, external_id: u.external_id, summary: u.summary, read: u.read ?? true, write_target: false, sync_token: null, deleted_at: null });
    }),
    softDeleteCalendars: vi.fn(async () => undefined),
    setWriteTarget: vi.fn(async () => undefined),
    mirror: {
      replaceEvents: vi.fn(async (_c: CalendarRef, r: ProviderEvent[]) => {
        mirror.clear();
        for (const e of r) mirror.set(e.externalId, e);
      }),
      upsertEvents: vi.fn(async (_c: CalendarRef, r: ProviderEvent[]) => void r.forEach((e) => mirror.set(e.externalId, e))),
      removeEvents: vi.fn(async (_c: CalendarRef, ids: string[]) => void ids.forEach((id) => mirror.delete(id))),
      setSyncToken: vi.fn(async (id: string, token: string | null) => {
        rows = rows.map((r) => (r.id === id ? { ...r, sync_token: token } : r));
      }),
    },
    channels: { due: vi.fn(async () => []), put: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) },
  };
  return { store: store as unknown as SupabaseAccountStore, spies: store, mirror, log, rows: () => rows };
}

describe("the worker's wiring picks the provider by the account", () => {
  beforeEach(() => {
    vi.stubEnv("CALENDAR_TOKEN_KEY", KEY_B64);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "gid");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "gsecret");
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_ID", "mid");
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_SECRET", "msecret");
    vi.stubEnv("GOOGLE_WEBHOOK_TOKEN_SECRET", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("a Google account gets Google's client, an Outlook account gets Graph's", () => {
    const deps = buildDeps(memoryStore().store);
    expect(deps.providerFor("t", account({ provider: "google" }))).toBeInstanceOf(GoogleCalendar);
    expect(deps.providerFor("t", account())).toBeInstanceOf(MicrosoftCalendar);
    // Outlook's client has no busy-times call, no channels and no calendar to create: the worker reads it event by event.
    const outlook = deps.providerFor("t", account());
    expect([outlook.freeBusy, outlook.watch, outlook.stop, outlook.createCalendar]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("each account's token is refreshed at its own provider, with that provider's client id", async () => {
    const asked: { url: string; clientId: string | null }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        asked.push({ url: String(url), clientId: new URLSearchParams(String(init?.body)).get("client_id") });
        return json({ access_token: "at", expires_in: 3600 });
      }),
    );
    const deps = buildDeps(memoryStore().store);
    await deps.refresh("rt", account());
    await deps.refresh("rt", account({ provider: "google" }));
    expect(asked).toEqual([
      { url: "https://login.microsoftonline.com/common/oauth2/v2.0/token", clientId: "mid" },
      { url: "https://oauth2.googleapis.com/token", clientId: "gid" },
    ]);
  });

  it("a provider without its variables is not wired, and an account of it says so instead of being sent to the other one", () => {
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_ID", "");
    expect(Object.keys(providerWiring())).toEqual(["google"]);
    const deps = buildDeps(memoryStore().store);
    expect(() => deps.providerFor("t", account())).toThrow("Outlook isn't set up on this server");
    expect(() => deps.refresh("rt", account())).toThrow("Outlook isn't set up on this server");
    expect(deps.providerFor("t", account({ provider: "google" }))).toBeInstanceOf(GoogleCalendar);

    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_ID", "mid");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    expect(Object.keys(providerWiring())).toEqual(["microsoft"]);
    // A server that connects Outlook alone still builds its worker.
    expect(() => buildDeps(memoryStore().store)).not.toThrow();
    expect(() => wiringFor(account({ provider: "google" }))).toThrow("Google Calendar isn't set up on this server");
  });

  it("blocks are never written to Outlook: the writer refuses the account, lets its claim go, and asks Microsoft nothing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const m = memoryStore([account({ access_b64: sealToBase64("AT", key), token_expires_at: new Date(Date.now() + 3600_000).toISOString() })]);
    await expect(writerFor("acct", buildDeps(m.store))).rejects.toThrow("blocks are not written to Outlook");
    expect(m.spies.release).toHaveBeenCalledWith("acct");
    expect(fetchSpy).not.toHaveBeenCalled();
    // A Google account still gets its writer.
    const g = memoryStore([account({ provider: "google", access_b64: sealToBase64("AT", key), token_expires_at: new Date(Date.now() + 3600_000).toISOString() })]);
    expect(await writerFor("acct", buildDeps(g.store))).toBeInstanceOf(GoogleCalendar);
  });

  it("a whole pass for an Outlook account: refresh at Microsoft, calendars and a delta round from Graph, times kept and titles not; then the next round", async () => {
    const delta = "https://graph.microsoft.com/v1.0/me/calendars('CAL')/calendarView/delta?$deltatoken=ONE";
    const event = (id: string, hour: string, subject: string) => ({ id, subject, start: { dateTime: `2026-11-16T${hour}:00:00.0000000`, timeZone: "UTC" }, end: { dateTime: `2026-11-16T${hour}:30:00.0000000`, timeZone: "UTC" }, isAllDay: false, isCancelled: false, showAs: "busy", type: "singleInstance", responseStatus: { response: "accepted" } });
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = String(input);
        seen.push(url.split("?")[0]);
        if (url === "https://login.microsoftonline.com/common/oauth2/v2.0/token") {
          expect(new URLSearchParams(String(init?.body)).get("refresh_token")).toBe("RT1");
          return json({ access_token: "AT2", refresh_token: "RT2", expires_in: 3599, scope: "openid email Calendars.ReadBasic" });
        }
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer AT2");
        if (url.startsWith("https://graph.microsoft.com/v1.0/me/calendars?")) return json({ value: [{ id: "CAL", name: "Calendar", hexColor: "", isDefaultCalendar: true, canEdit: true, isSharedWithMe: false }] });
        if (/\/me\/calendars\/CAL\/calendarView\/delta\?startDateTime=\d{4}-\d{2}-\d{2}T00:00:00Z&endDateTime=\d{4}-\d{2}-\d{2}T00:00:00Z$/.test(url)) return json({ "@odata.deltaLink": delta, value: [event("e1", "09", "Board prep"), event("e2", "14", "1:1 with Priya")] });
        if (url === delta) return json({ "@odata.deltaLink": `${delta}-TWO`, value: [{ id: "e1", "@removed": { reason: "deleted" } }] });
        return json({ error: { code: "unexpected" } }, 500);
      }),
    );
    const m = memoryStore();
    // The window follows the real clock; the events are only kept if they fall inside it.
    vi.useFakeTimers({ now: new Date("2026-11-15T10:00:00Z"), toFake: ["Date"] });
    try {
      const deps = buildDeps(m.store);
      expect(await syncAccount(account(), deps)).toEqual({ status: "ok", calendars: 1, events: 2, error: null });
      expect(m.log).toEqual(["tokens access=AT2 refresh=RT2", "finish ok"]);
      expect(seen.slice(0, 3)).toEqual(["https://login.microsoftonline.com/common/oauth2/v2.0/token", "https://graph.microsoft.com/v1.0/me/calendars", "https://graph.microsoft.com/v1.0/me/calendars/CAL/calendarView/delta"]);
      expect([...m.mirror.values()].map((e) => [e.externalId, e.startAt, e.endAt, e.summary])).toEqual([
        ["e1", "2026-11-16T09:00:00.000Z", "2026-11-16T09:30:00.000Z", null],
        ["e2", "2026-11-16T14:00:00.000Z", "2026-11-16T14:30:00.000Z", null],
      ]);
      expect(JSON.stringify([...m.mirror.values()])).not.toMatch(/Board|Priya/);
      expect(m.rows()[0]).toMatchObject({ external_id: "CAL", read: true });
      expect(readSyncToken(m.rows()[0].sync_token!)).toEqual({ day: "2026-11-15", link: delta });

      // The next pass, a fortnight on: the stored link, what left, and the window's own day kept on the new token.
      vi.setSystemTime(new Date("2026-11-29T10:00:00Z"));
      const again = await syncAccount(account({ access_b64: sealToBase64("AT2", key), token_expires_at: "2026-11-29T11:00:00Z" }), deps);
      expect(again).toEqual({ status: "ok", calendars: 1, events: 1, error: null });
      expect([...m.mirror.keys()]).toEqual(["e2"]);
      expect(m.rows()[0].sync_token).toBe(`2026-11-15|${delta}-TWO`);
    } finally {
      vi.useRealTimers();
    }
  });
});
