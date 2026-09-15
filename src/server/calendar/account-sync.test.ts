import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { defaultRead, syncAccount, type AccountStore, type AccountSyncDeps, type CalendarRow, type CalendarUpsert, type ClaimedAccount, type WatchPort } from "./account-sync";
import { openFromBase64, sealToBase64 } from "./crypto";
import { NeedsReauth, type CalendarProvider, type ProviderCalendar, type ProviderEvent } from "./provider";
import type { CalendarRef, MirrorStore } from "./sync";

const key = randomBytes(32);
const NOW = new Date("2026-09-15T10:00:00Z");

const account = (over: Partial<ClaimedAccount> = {}): ClaimedAccount => ({
  id: "acct",
  user_id: "u1",
  space_id: "s1",
  provider: "google",
  external_account: "g-1",
  email: "sam@gmail.com",
  refresh_b64: sealToBase64("refresh", key),
  access_b64: sealToBase64("access", key),
  token_expires_at: new Date(NOW.getTime() + 3600_000).toISOString(),
  scopes: [],
  key_version: 1,
  status: "ok",
  ...over,
});

const cal = (externalId: string, over: Partial<ProviderCalendar> = {}): ProviderCalendar => ({ externalId, summary: externalId, timezone: null, color: null, accessRole: "owner", primary: false, ...over });
const ev = (id: string): ProviderEvent => ({ externalId: id, recurringEventId: null, originalStartAt: null, summary: id, startAt: "2026-09-16T09:00:00.000Z", endAt: "2026-09-16T10:00:00.000Z", startDate: null, endDate: null, allDay: false, busy: true, status: "confirmed", selfResponse: null, eventType: "default", isOurs: false, etag: null });

function fakes(opts: { remote?: ProviderCalendar[]; existing?: CalendarRow[]; events?: Record<string, ProviderEvent[]>; webhook?: boolean } = {}) {
  let rows: CalendarRow[] = opts.existing ?? [];
  const log: string[] = [];
  const mirror: MirrorStore = {
    replaceEvents: vi.fn(async (c: CalendarRef, r: ProviderEvent[]) => void log.push(`replace ${c.externalId}:${r.length}`)),
    upsertEvents: vi.fn(async (c: CalendarRef, r: ProviderEvent[]) => void log.push(`upsert ${c.externalId}:${r.length}`)),
    removeEvents: vi.fn(async (c: CalendarRef, ids: string[]) => void log.push(`remove ${c.externalId}:${ids.length}`)),
    setSyncToken: vi.fn(async (id: string, t: string | null) => void log.push(`token ${id}:${t}`)),
  };
  const store: AccountStore = {
    saveTokens: vi.fn(async (_id: string, access: string, _exp: Date, refresh?: string | null) => void log.push(`tokens access=${openFromBase64(access, key)} refresh=${refresh ? openFromBase64(refresh, key) : "kept"}`)),
    finish: vi.fn(async (_id: string, status: "ok" | "needs_reauth", error: string | null) => void log.push(`finish ${status}${error ? ` (${error})` : ""}`)),
    calendarsOf: vi.fn(async () => rows),
    upsertCalendars: vi.fn(async (ups: CalendarUpsert[]) => {
      for (const u of ups) {
        const known = rows.find((r) => r.external_id === u.external_id);
        if (known) Object.assign(known, { summary: u.summary, deleted_at: null });
        else rows.push({ id: `id-${u.external_id}`, external_id: u.external_id, summary: u.summary, read: u.read ?? true, write_target: false, sync_token: null, deleted_at: null });
      }
      log.push(`upsertCalendars ${ups.map((u) => `${u.external_id}${u.id ? "" : `(new read=${u.read})`}`).join(",")}`);
    }),
    softDeleteCalendars: vi.fn(async (ids: string[]) => {
      rows = rows.map((r) => (ids.includes(r.id) ? { ...r, deleted_at: "now" } : r));
      log.push(`softDelete ${ids.join(",")}`);
    }),
    mirror,
    channels: {
      due: vi.fn(async () => rows.filter((r) => r.read && !r.deleted_at).map((r) => ({ calendar_id: r.id, channel_id: null, resource_id: null }))),
      put: vi.fn(async (ch: { id: string; calendarId: string; resourceId: string; token: string; expiresAt: Date }) => void log.push(`channel ${ch.calendarId}`)),
      remove: vi.fn(async () => undefined),
    },
  };
  const provider = {
    listCalendars: vi.fn(async (): Promise<ProviderCalendar[]> => opts.remote ?? []),
    listEvents: vi.fn<CalendarProvider["listEvents"]>(async (externalId) => ({ items: opts.events?.[externalId] ?? [], nextPageToken: null, nextSyncToken: `T-${externalId}` })),
    watch: vi.fn<WatchPort["watch"]>(async () => ({ resourceId: "res", expiresAt: new Date(NOW.getTime() + 604_800_000) })),
    stop: vi.fn<WatchPort["stop"]>(async () => undefined),
  } satisfies CalendarProvider & WatchPort;
  const deps: AccountSyncDeps = {
    key,
    store,
    providerFor: vi.fn<AccountSyncDeps["providerFor"]>(() => provider),
    refresh: vi.fn<AccountSyncDeps["refresh"]>(async () => ({ accessToken: "fresh", refreshToken: null, expiresAt: new Date(NOW.getTime() + 3600_000), scopes: [], sub: null, email: null })),
    webhook: opts.webhook ? { address: "https://app.example/api/webhooks/google-calendar", channelToken: (c, ch) => `tok:${c}:${ch}` } : null,
    newId: () => "chan-1",
    now: () => NOW,
    today: () => "2026-09-15",
  };
  return { deps, store, provider, log, rows: () => rows };
}

describe("defaultRead", () => {
  it("counts the primary and owned calendars as busy, not subscribed ones", () => {
    expect(defaultRead(cal("p", { primary: true, accessRole: "reader" }))).toBe(true);
    expect(defaultRead(cal("mine", { accessRole: "owner" }))).toBe(true);
    expect(defaultRead(cal("en.uk#holiday@group.v.calendar.google.com", { accessRole: "reader" }))).toBe(false);
  });
});

describe("syncAccount", () => {
  it("uses the stored access token while it is fresh, reconciles calendars, syncs the ones that read, and reports ok", async () => {
    const f = fakes({
      remote: [cal("primary", { primary: true }), cal("holidays", { accessRole: "reader" }), cal("team")],
      existing: [{ id: "id-team", external_id: "team", summary: "Old name", read: false, write_target: false, sync_token: "T0", deleted_at: null }, { id: "id-gone", external_id: "gone", summary: "Gone", read: true, write_target: false, sync_token: null, deleted_at: null }],
      events: { primary: [ev("a"), ev("b")] },
    });
    const out = await syncAccount(account(), f.deps);
    expect(out).toEqual({ status: "ok", calendars: 3, events: 2, error: null });
    expect(f.deps.refresh).not.toHaveBeenCalled();
    expect(f.deps.providerFor).toHaveBeenCalledWith("access");
    expect(f.log).toEqual([
      "upsertCalendars primary(new read=true),holidays(new read=false),team",
      "softDelete id-gone",
      "replace primary:2",
      "token id-primary:T-primary",
      "finish ok",
    ]);
    // A calendar the person switched off is not fetched at all (quota, §6.7).
    expect(f.provider.listEvents).toHaveBeenCalledTimes(1);
    expect(f.rows().find((r) => r.external_id === "team")?.summary).toBe("team");
  });

  it("refreshes an expiring token first and stores the new one sealed", async () => {
    const f = fakes({ remote: [cal("primary", { primary: true })] });
    const out = await syncAccount(account({ token_expires_at: new Date(NOW.getTime() + 60_000).toISOString() }), f.deps);
    expect(out.status).toBe("ok");
    expect(f.deps.refresh).toHaveBeenCalledWith("refresh");
    expect(f.log[0]).toBe("tokens access=fresh refresh=kept");
    expect(f.deps.providerFor).toHaveBeenCalledWith("fresh");
  });

  it("without a refresh token, or when Google revokes the grant, the account needs reconnecting and the reason is recorded", async () => {
    const f = fakes();
    expect((await syncAccount(account({ refresh_b64: null, access_b64: null }), f.deps)).status).toBe("needs_reauth");
    expect(f.log).toEqual(["finish needs_reauth (Google Calendar access has lapsed. Reconnect to keep syncing.)"]);

    const g = fakes();
    (g.deps.refresh as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new NeedsReauth("invalid_grant"));
    const out = await syncAccount(account({ access_b64: null }), g.deps);
    expect(out.status).toBe("needs_reauth");
    expect(g.store.finish).toHaveBeenCalledWith("acct", "needs_reauth", expect.stringMatching(/Reconnect/));
  });

  it("a transient failure keeps the account ok, records what happened, and releases the claim", async () => {
    const f = fakes({ remote: [cal("primary", { primary: true })] });
    f.provider.listEvents.mockRejectedValueOnce(new Error("google events.list: 503"));
    const out = await syncAccount(account(), f.deps);
    expect(out).toEqual({ status: "error", calendars: 0, events: 0, error: "google events.list: 503" });
    expect(f.store.finish).toHaveBeenCalledWith("acct", "ok", "Couldn't reach Google Calendar (google events.list: 503).");
  });

  it("registers a push channel per reading calendar when a public address exists, and not otherwise", async () => {
    const without = fakes({ remote: [cal("primary", { primary: true })] });
    await syncAccount(account(), without.deps);
    expect(without.provider.watch).not.toHaveBeenCalled();

    const withHook = fakes({ remote: [cal("primary", { primary: true }), cal("holidays", { accessRole: "reader" })], webhook: true });
    await syncAccount(account(), withHook.deps);
    expect(withHook.provider.watch).toHaveBeenCalledTimes(1);
    expect(withHook.provider.watch).toHaveBeenCalledWith("primary", { id: "chan-1", address: "https://app.example/api/webhooks/google-calendar", token: "tok:id-primary:chan-1", ttlSeconds: 604_800 });
    expect(withHook.store.channels.put).toHaveBeenCalledWith(expect.objectContaining({ id: "chan-1", calendarId: "id-primary", resourceId: "res" }));
  });
});
