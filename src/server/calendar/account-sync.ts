// One account, one pass (SYSTEM_DESIGN.md §6.2–§6.4): make the access token
// good, reconcile the calendar list, sync every calendar that reads, keep the
// push channels alive, and record how it went where the client can see it.
// Everything that talks to the outside world is a port, so the whole pass is
// unit-tested with fakes.
import { CURRENT_KEY_VERSION, openFromBase64, sealToBase64 } from "./crypto";
import type { TokenGrant } from "./google";
import { NeedsReauth, type CalendarProvider, type ProviderCalendar } from "./provider";
import { syncCalendarEvents, windowAround, type CalendarRef, type MirrorStore } from "./sync";

/** A row from calendar_accounts_claim: tokens still sealed. */
export interface ClaimedAccount {
  id: string;
  user_id: string;
  space_id: string;
  provider: string;
  external_account: string;
  email: string | null;
  refresh_b64: string | null;
  access_b64: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  key_version: number;
  status: string;
}

export interface CalendarRow {
  id: string;
  external_id: string;
  summary: string;
  read: boolean;
  write_target: boolean;
  sync_token: string | null;
  deleted_at: string | null;
}

export interface CalendarUpsert {
  id?: string;
  space_id: string;
  user_id: string;
  calendar_account_id: string;
  external_id: string;
  summary: string;
  timezone: string | null;
  color: string | null;
  access_role: string;
  read?: boolean;
  deleted_at: null;
}

export interface ChannelPort {
  /** Calendars whose channel is missing or expiring within a day. */
  due(accountId: string): Promise<{ calendar_id: string; channel_id: string | null; resource_id: string | null }[]>;
  put(channel: { id: string; calendarId: string; resourceId: string; token: string; expiresAt: Date }): Promise<void>;
  remove(channelId: string): Promise<void>;
}

export interface AccountStore {
  saveTokens(id: string, accessB64: string, expiresAt: Date, refreshB64?: string | null): Promise<void>;
  finish(id: string, status: "ok" | "needs_reauth", error: string | null): Promise<void>;
  calendarsOf(accountId: string): Promise<CalendarRow[]>;
  upsertCalendars(rows: CalendarUpsert[]): Promise<void>;
  softDeleteCalendars(ids: string[]): Promise<void>;
  /** The §6.1 fallback: an app-created calendar becomes the one write target. */
  setWriteTarget(userId: string, calendarId: string): Promise<void>;
  mirror: MirrorStore;
  channels: ChannelPort;
}

export const APP_CREATED_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
export const APP_CALENDAR_NAME = "Sparehour";

export interface WatchPort {
  watch(externalCalendarId: string, channel: { id: string; address: string; token: string; ttlSeconds: number }): Promise<{ resourceId: string; expiresAt: Date }>;
  stop(channelId: string, resourceId: string): Promise<void>;
}

export interface AccountSyncDeps {
  key: Buffer;
  store: AccountStore;
  providerFor: (accessToken: string) => CalendarProvider & Partial<WatchPort> & Partial<{ createCalendar(summary: string, timezone: string | null): Promise<ProviderCalendar> }>;
  refresh: (refreshToken: string) => Promise<TokenGrant>;
  /** null when push channels cannot be used (no public HTTPS address, §6.4). */
  webhook: { address: string; channelToken: (calendarId: string, channelId: string) => string } | null;
  newId: () => string;
  now: () => Date;
  /** YYYY-MM-DD in the account's zone is not needed: the window is generous either way. */
  today: () => string;
}

export interface AccountSyncResult {
  status: "ok" | "needs_reauth" | "error";
  calendars: number;
  events: number;
  error: string | null;
}

const REFRESH_AHEAD_MS = 5 * 60 * 1000;
export const CHANNEL_TTL_SECONDS = 604_800;

/** ONBOARDING.md step 2 (B4): the primary and anything the person owns count as busy; subscribed and holiday calendars do not. */
export const defaultRead = (c: ProviderCalendar): boolean => c.primary || c.accessRole === "owner";

async function goodAccessToken(acct: ClaimedAccount, deps: AccountSyncDeps): Promise<string> {
  const expiresAt = acct.token_expires_at ? new Date(acct.token_expires_at).getTime() : 0;
  if (acct.access_b64 && expiresAt - deps.now().getTime() > REFRESH_AHEAD_MS) return openFromBase64(acct.access_b64, deps.key);
  if (!acct.refresh_b64) throw new NeedsReauth("no calendar access on file");
  const grant = await deps.refresh(openFromBase64(acct.refresh_b64, deps.key));
  // Rotate on touch: whatever key version the row had, it is written back under the current one.
  await deps.store.saveTokens(acct.id, sealToBase64(grant.accessToken, deps.key), grant.expiresAt, grant.refreshToken ? sealToBase64(grant.refreshToken, deps.key) : acct.key_version !== CURRENT_KEY_VERSION ? sealToBase64(openFromBase64(acct.refresh_b64, deps.key), deps.key) : null);
  return grant.accessToken;
}

async function reconcileCalendars(acct: ClaimedAccount, provider: CalendarProvider, deps: AccountSyncDeps): Promise<CalendarRow[]> {
  const remote = await provider.listCalendars();
  const existing = await deps.store.calendarsOf(acct.id);
  const byExternal = new Map(existing.map((c) => [c.external_id, c]));
  const upserts: CalendarUpsert[] = remote.map((c) => {
    const known = byExternal.get(c.externalId);
    return {
      ...(known ? { id: known.id } : { read: defaultRead(c) }),
      space_id: acct.space_id,
      user_id: acct.user_id,
      calendar_account_id: acct.id,
      external_id: c.externalId,
      summary: c.summary,
      timezone: c.timezone,
      color: c.color,
      access_role: c.accessRole,
      deleted_at: null,
    };
  });
  if (upserts.length) await deps.store.upsertCalendars(upserts);
  const remoteIds = new Set(remote.map((c) => c.externalId));
  const gone = existing.filter((c) => !c.deleted_at && !remoteIds.has(c.external_id)).map((c) => c.id);
  if (gone.length) await deps.store.softDeleteCalendars(gone);
  return (await deps.store.calendarsOf(acct.id)).filter((c) => !c.deleted_at);
}

/**
 * The person declined writing to their own calendar and granted the app-created
 * scope instead (§6.1): make sure a "Sparehour" calendar exists and takes the
 * blocks. Reuses one already named so; never creates twice.
 */
async function ensureAppCalendar(acct: ClaimedAccount, provider: AccountSyncDeps["providerFor"] extends (t: string) => infer P ? P : never, calendars: CalendarRow[], deps: AccountSyncDeps): Promise<CalendarRow[]> {
  if (!(acct.scopes ?? []).includes(APP_CREATED_SCOPE) || !provider.createCalendar) return calendars;
  if (calendars.some((c) => c.write_target)) return calendars;
  let own = calendars.find((c) => c.summary === APP_CALENDAR_NAME);
  if (!own) {
    const made = await provider.createCalendar(APP_CALENDAR_NAME, null);
    await deps.store.upsertCalendars([{ space_id: acct.space_id, user_id: acct.user_id, calendar_account_id: acct.id, external_id: made.externalId, summary: made.summary, timezone: made.timezone, color: made.color, access_role: "owner", read: true, deleted_at: null }]);
    own = (await deps.store.calendarsOf(acct.id)).find((c) => c.external_id === made.externalId);
  }
  if (own) await deps.store.setWriteTarget(acct.user_id, own.id);
  return (await deps.store.calendarsOf(acct.id)).filter((c) => !c.deleted_at);
}

async function keepChannels(acct: ClaimedAccount, provider: CalendarProvider & Partial<WatchPort>, calendars: CalendarRow[], deps: AccountSyncDeps): Promise<void> {
  if (!deps.webhook || !provider.watch || !provider.stop) return;
  const byId = new Map(calendars.map((c) => [c.id, c]));
  for (const due of await deps.store.channels.due(acct.id)) {
    const cal = byId.get(due.calendar_id);
    if (!cal) continue;
    const id = deps.newId();
    try {
      // New before old, so there is no gap (§6.4).
      const made = await provider.watch(cal.external_id, { id, address: deps.webhook.address, token: deps.webhook.channelToken(cal.id, id), ttlSeconds: CHANNEL_TTL_SECONDS });
      await deps.store.channels.put({ id, calendarId: cal.id, resourceId: made.resourceId, token: deps.webhook.channelToken(cal.id, id), expiresAt: made.expiresAt });
      if (due.channel_id && due.resource_id) {
        await provider.stop(due.channel_id, due.resource_id).catch(() => undefined);
        await deps.store.channels.remove(due.channel_id);
      }
    } catch {
      // Push is an optimisation; the hourly reconcile still runs (§6.4).
    }
  }
}

export async function syncAccount(acct: ClaimedAccount, deps: AccountSyncDeps): Promise<AccountSyncResult> {
  try {
    const accessToken = await goodAccessToken(acct, deps);
    const provider = deps.providerFor(accessToken);
    const calendars = await ensureAppCalendar(acct, provider, await reconcileCalendars(acct, provider, deps), deps);
    const window = windowAround(deps.today());
    let events = 0;
    for (const c of calendars) {
      if (!c.read) continue;
      const ref: CalendarRef = { id: c.id, spaceId: acct.space_id, userId: acct.user_id, externalId: c.external_id, syncToken: c.sync_token };
      const out = await syncCalendarEvents(provider, deps.store.mirror, ref, window);
      events += out.upserted + out.removed;
    }
    await keepChannels(acct, provider, calendars, deps);
    await deps.store.finish(acct.id, "ok", null);
    return { status: "ok", calendars: calendars.length, events, error: null };
  } catch (e) {
    if (e instanceof NeedsReauth) {
      const message = "Google Calendar access has lapsed. Reconnect to keep syncing.";
      await deps.store.finish(acct.id, "needs_reauth", message);
      return { status: "needs_reauth", calendars: 0, events: 0, error: message };
    }
    const message = e instanceof Error ? e.message : String(e);
    await deps.store.finish(acct.id, "ok", `Couldn't reach Google Calendar (${message}).`);
    return { status: "error", calendars: 0, events: 0, error: message };
  }
}
