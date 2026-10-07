// Account deletion's server half (SYSTEM_DESIGN.md §9.6; ruled 2026-10-06):
// the account is marked (users.deleted_at and the auth user's app metadata,
// in one database function), every connected calendar is let go at once —
// its watch channels stopped at Google, its grant revoked, its tokens and
// mirror dropped, as Disconnect does — and every session ends. A nightly job
// removes the account and every row with it after 30 days; signing in before
// then offers Restore. The emailed receipt and the analytics deletion wait
// until those services exist.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimedAccount } from "@/server/calendar/account-sync";
import { googleOAuth } from "@/server/calendar/config";
import { openFromBase64, parseTokenKey, sealToBase64 } from "@/server/calendar/crypto";
import { GoogleCalendar, refreshAccessToken, revokeToken } from "@/server/calendar/google";
import { SupabaseAccountStore } from "@/server/calendar/store";

export interface TeardownPorts {
  /** The person's connected calendar accounts. */
  accountIds(userId: string): Promise<string[]>;
  /** Every watch channel on those accounts' calendars. */
  channels(userId: string): Promise<{ account_id: string; channel_id: string; resource_id: string }[]>;
  /** An access token good for a minute or two, or null when there is none to be had. */
  accessToken(accountId: string): Promise<string | null>;
  stop(accessToken: string, channelId: string, resourceId: string): Promise<void>;
  /** Drops the account's tokens, channels and mirror; resolves the refresh token in the clear ("" when none). */
  disconnect(accountId: string, userId: string): Promise<string | null>;
  revoke(token: string): Promise<void>;
}

/**
 * Lets every calendar of one person go: channels stopped first (they need a live token), then the account
 * disconnected and its grant revoked. Best effort at Google — a failure there never keeps the tokens here.
 */
export async function tearDownCalendars(userId: string, ports: TeardownPorts): Promise<{ accounts: number; stopped: number }> {
  const ids = await ports.accountIds(userId);
  if (ids.length === 0) return { accounts: 0, stopped: 0 };
  const channels = await ports.channels(userId).catch(() => []);
  let stopped = 0;
  for (const id of ids) {
    const mine = channels.filter((c) => c.account_id === id);
    if (mine.length > 0) {
      const token = await ports.accessToken(id).catch(() => null);
      if (token) {
        for (const ch of mine) {
          try {
            await ports.stop(token, ch.channel_id, ch.resource_id);
            stopped++;
          } catch {
            // An expired channel lapses on its own; its row goes with the disconnect below.
          }
        }
      }
    }
    const refresh = await ports.disconnect(id, userId);
    if (refresh) await ports.revoke(refresh).catch(() => undefined);
  }
  return { accounts: ids.length, stopped };
}

/** The real ports: the service-role client, the sealed tokens, Google over fetch. */
export function liveTeardown(admin: SupabaseClient): TeardownPorts {
  const store = new SupabaseAccountStore(admin);
  const key = () => parseTokenKey(process.env.CALENDAR_TOKEN_KEY);
  return {
    accountIds: async (userId) => {
      const { data, error } = await admin.from("calendar_connections").select("id").eq("user_id", userId).is("deleted_at", null);
      if (error) throw new Error(`calendar_connections: ${error.message}`);
      return (data ?? []).map((r: { id: string }) => r.id);
    },
    channels: async (userId) => {
      const { data, error } = await admin.rpc("account_calendar_channels", { p_user: userId });
      if (error) throw new Error(`account_calendar_channels: ${error.message}`);
      return (data ?? []) as { account_id: string; channel_id: string; resource_id: string }[];
    },
    accessToken: async (accountId) => {
      const [acct] = (await store.claim(null, 1, true, accountId)) as ClaimedAccount[];
      if (!acct) return null;
      try {
        const expiresAt = acct.token_expires_at ? new Date(acct.token_expires_at).getTime() : 0;
        if (acct.access_b64 && expiresAt - Date.now() > 60_000) return openFromBase64(acct.access_b64, key());
        const oauth = googleOAuth();
        if (!oauth || !acct.refresh_b64) return null;
        const grant = await refreshAccessToken(oauth, openFromBase64(acct.refresh_b64, key()));
        await store.saveTokens(acct.id, sealToBase64(grant.accessToken, key()), grant.expiresAt, grant.refreshToken ? sealToBase64(grant.refreshToken, key()) : null);
        return grant.accessToken;
      } finally {
        await store.release(acct.id).catch(() => undefined);
      }
    },
    stop: (accessToken, channelId, resourceId) => new GoogleCalendar(accessToken).stop(channelId, resourceId),
    disconnect: async (accountId, userId) => {
      const sealed = await store.disconnect(accountId, userId);
      if (!sealed) return sealed;
      try {
        return openFromBase64(sealed, key());
      } catch {
        return "";
      }
    },
    revoke: (token) => revokeToken(token),
  };
}
