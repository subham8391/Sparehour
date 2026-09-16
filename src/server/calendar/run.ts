// Wires the account worker to the real world: the service-role store, the
// Google client, the token key, the webhook address. Used by the routes; the
// worker itself never reads the environment.
import { createHmac, randomUUID } from "node:crypto";
import { serviceRoleClient } from "@/server/auth/supabase";
import { syncAccount, type AccountSyncDeps, type AccountSyncResult, type ClaimedAccount } from "./account-sync";
import { googleOAuth, tokenKey, webhook } from "./config";
import { openFromBase64, sealToBase64 } from "./crypto";
import { GoogleCalendar, refreshAccessToken } from "./google";
import { pushBlocks, type EventWriter, type PushReport } from "./push";
import { SupabaseAccountStore } from "./store";

export const channelToken = (secret: string, calendarId: string, channelId: string): string =>
  createHmac("sha256", `calendar-channel:${secret}`).update(`${calendarId}:${channelId}`).digest("base64url");

export function buildDeps(store = new SupabaseAccountStore(serviceRoleClient())): AccountSyncDeps & { store: SupabaseAccountStore } {
  const oauth = googleOAuth();
  if (!oauth) throw new Error("Google Calendar is not configured (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET)");
  const hook = webhook();
  return {
    key: tokenKey(),
    store,
    providerFor: (accessToken) => new GoogleCalendar(accessToken),
    refresh: (refreshToken) => refreshAccessToken(oauth, refreshToken),
    webhook: hook ? { address: hook.address, channelToken: (calendarId, channelId) => channelToken(hook.secret, calendarId, channelId) } : null,
    newId: () => randomUUID(),
    now: () => new Date(),
    today: () => new Date().toISOString().slice(0, 10),
  };
}

export type SyncReport = Record<string, AccountSyncResult>;

async function syncClaimed(accounts: ClaimedAccount[], deps = buildDeps()): Promise<SyncReport> {
  const report: SyncReport = {};
  for (const a of accounts) report[a.id] = await syncAccount(a, deps);
  return report;
}

/** "Sync now" and the app coming back to the foreground: every account of one person, due or not. */
export async function syncUser(userId: string, deps = buildDeps()): Promise<SyncReport> {
  return syncClaimed(await deps.store.claim(userId, 20, true), deps);
}

/** The hourly reconcile (§6.4): whatever is due across everyone, a few at a time. */
export async function syncDue(limit = 10, deps = buildDeps()): Promise<SyncReport> {
  return syncClaimed(await deps.store.claim(null, limit, false), deps);
}

/** After a connect or a webhook: this account, now — and only this account is claimed. */
export async function syncAccountById(accountId: string, deps = buildDeps()): Promise<AccountSyncResult | null> {
  await deps.store.requestSync(accountId);
  const claimed = await deps.store.claim(null, 1, true, accountId);
  if (!claimed.length) return null;
  return (await syncClaimed(claimed, deps))[accountId] ?? null;
}

/**
 * A Google client for the account behind a block's write calendar, with a
 * token that is good for the next few minutes (§6.2).
 */
async function writerFor(accountId: string, deps: AccountSyncDeps & { store: SupabaseAccountStore }): Promise<EventWriter> {
  const oauth = googleOAuth();
  if (!oauth) throw new Error("Google Calendar is not configured");
  const [acct] = await deps.store.claim(null, 1, true, accountId);
  if (!acct) throw new Error("the calendar account is gone or busy");
  try {
    const expiresAt = acct.token_expires_at ? new Date(acct.token_expires_at).getTime() : 0;
    let accessToken = acct.access_b64 && expiresAt - Date.now() > 5 * 60 * 1000 ? openFromBase64(acct.access_b64, deps.key) : null;
    if (!accessToken) {
      if (!acct.refresh_b64) throw new Error("no calendar access on file");
      const grant = await deps.refresh(openFromBase64(acct.refresh_b64, deps.key));
      await deps.store.saveTokens(acct.id, sealToBase64(grant.accessToken, deps.key), grant.expiresAt, grant.refreshToken ? sealToBase64(grant.refreshToken, deps.key) : null);
      accessToken = grant.accessToken;
    }
    return new GoogleCalendar(accessToken);
  } finally {
    // The claim above only served to read the tokens; let it go without recording a sync.
    await deps.store.release(acct.id).catch(() => undefined);
  }
}

/** Blocks Google is behind on — one person's (after a block changes, or "Sync now") or everyone's (the tick). */
export async function pushUser(userId: string, deps = buildDeps()): Promise<PushReport> {
  return pushBlocks({ store: deps.store, writerFor: (id) => writerFor(id, deps) }, userId);
}

export async function pushDue(deps = buildDeps()): Promise<PushReport> {
  return pushBlocks({ store: deps.store, writerFor: (id) => writerFor(id, deps) }, null);
}
