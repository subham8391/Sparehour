// Wires the account worker to the real world: the service-role store, the
// Google client, the token key, the webhook address. Used by the routes; the
// worker itself never reads the environment.
import { createHmac, randomUUID } from "node:crypto";
import { serviceRoleClient } from "@/server/auth/supabase";
import { syncAccount, type AccountSyncDeps, type AccountSyncResult, type ClaimedAccount } from "./account-sync";
import { googleOAuth, tokenKey, webhook } from "./config";
import { GoogleCalendar, refreshAccessToken } from "./google";
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

/** After a connect or a webhook: this account, now. */
export async function syncAccountById(accountId: string, userId: string, deps = buildDeps()): Promise<AccountSyncResult | null> {
  await deps.store.requestSync(accountId);
  const claimed = (await deps.store.claim(userId, 20, true)).filter((a) => a.id === accountId);
  if (!claimed.length) return null;
  return (await syncClaimed(claimed, deps))[accountId] ?? null;
}
