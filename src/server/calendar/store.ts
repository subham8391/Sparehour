// The database side of the calendar worker, on the service-role client:
// public.calendars and public.calendar_events directly (RLS does not apply to
// the service role), private.calendar_accounts and the channels through the
// public wrapper functions the migration exposes to service_role only.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountStore, CalendarRow, CalendarUpsert, ChannelPort, ClaimedAccount } from "./account-sync";
import type { ProviderEvent } from "./provider";
import type { CalendarRef, MirrorStore } from "./sync";

const CHUNK = 400;
const chunks = <T>(xs: T[], n = CHUNK): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));

const fail = (what: string, error: { message: string } | null): void => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

export function toEventRow(cal: CalendarRef, e: ProviderEvent) {
  return {
    space_id: cal.spaceId,
    user_id: cal.userId,
    calendar_id: cal.id,
    external_id: e.externalId,
    recurring_event_id: e.recurringEventId,
    original_start_at: e.originalStartAt,
    summary: e.summary,
    start_at: e.startAt,
    end_at: e.endAt,
    start_date: e.startDate,
    end_date: e.endDate,
    all_day: e.allDay,
    busy: e.busy,
    status: e.status,
    self_response: e.selfResponse,
    event_type: e.eventType,
    is_ours: e.isOurs,
    etag: e.etag,
    deleted_at: null,
  };
}

// The service client is untyped (no generated database types yet); `any` stays inside this file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, "public", any>;

export class SupabaseMirrorStore implements MirrorStore {
  constructor(private readonly db: Db) {}

  async replaceEvents(cal: CalendarRef, rows: ProviderEvent[]): Promise<void> {
    const { data, error } = await this.db.from("calendar_events").select("external_id").eq("calendar_id", cal.id).is("deleted_at", null);
    fail("calendar_events select", error);
    const keep = new Set(rows.map((r) => r.externalId));
    const gone = ((data ?? []) as { external_id: string }[]).map((r) => r.external_id).filter((id) => !keep.has(id));
    await this.upsertEvents(cal, rows);
    await this.removeEvents(cal, gone);
  }

  async upsertEvents(cal: CalendarRef, rows: ProviderEvent[]): Promise<void> {
    for (const part of chunks(rows.map((r) => toEventRow(cal, r)))) {
      const { error } = await this.db.from("calendar_events").upsert(part, { onConflict: "calendar_id,external_id" });
      fail("calendar_events upsert", error);
    }
  }

  async removeEvents(cal: CalendarRef, externalIds: string[]): Promise<void> {
    for (const part of chunks(externalIds, 200)) {
      const { error } = await this.db.from("calendar_events").update({ deleted_at: new Date().toISOString() }).eq("calendar_id", cal.id).is("deleted_at", null).in("external_id", part);
      fail("calendar_events remove", error);
    }
  }

  async setSyncToken(calendarId: string, token: string | null): Promise<void> {
    const { error } = await this.db.from("calendars").update({ sync_token: token, last_synced_at: new Date().toISOString() }).eq("id", calendarId);
    fail("calendars sync_token", error);
  }
}

export class SupabaseAccountStore implements AccountStore {
  readonly mirror: MirrorStore;
  readonly channels: ChannelPort;

  constructor(private readonly db: Db) {
    this.mirror = new SupabaseMirrorStore(db);
    this.channels = {
      due: async (accountId) => {
        const { data, error } = await db.rpc("calendar_channels_due", { p_account: accountId });
        fail("calendar_channels_due", error);
        return (data ?? []) as { calendar_id: string; channel_id: string | null; resource_id: string | null }[];
      },
      put: async (ch) => {
        const { error } = await db.rpc("calendar_channel_put", { p_id: ch.id, p_calendar: ch.calendarId, p_resource: ch.resourceId, p_token: ch.token, p_expires: ch.expiresAt.toISOString() });
        fail("calendar_channel_put", error);
      },
      remove: async (id) => {
        const { error } = await db.rpc("calendar_channel_delete", { p_id: id });
        fail("calendar_channel_delete", error);
      },
    };
  }

  async claim(userId: string | null, limit: number, force: boolean): Promise<ClaimedAccount[]> {
    const { data, error } = await this.db.rpc("calendar_accounts_claim", { p_user: userId, p_limit: limit, p_force: force });
    fail("calendar_accounts_claim", error);
    return (data ?? []) as ClaimedAccount[];
  }

  async connect(input: { userId: string; provider: string; external: string; email: string | null; refreshB64: string | null; accessB64: string; expiresAt: Date; scopes: string[]; keyVersion: number }): Promise<string> {
    const { data, error } = await this.db.rpc("calendar_account_connect", {
      p_user: input.userId,
      p_provider: input.provider,
      p_external: input.external,
      p_email: input.email,
      p_refresh_b64: input.refreshB64,
      p_access_b64: input.accessB64,
      p_expires: input.expiresAt.toISOString(),
      p_scopes: input.scopes,
      p_key_version: input.keyVersion,
    });
    fail("calendar_account_connect", error);
    return data as string;
  }

  async saveTokens(id: string, accessB64: string, expiresAt: Date, refreshB64: string | null = null): Promise<void> {
    const { error } = await this.db.rpc("calendar_account_tokens", { p_id: id, p_access_b64: accessB64, p_expires: expiresAt.toISOString(), p_refresh_b64: refreshB64 });
    fail("calendar_account_tokens", error);
  }

  async finish(id: string, status: "ok" | "needs_reauth", err: string | null): Promise<void> {
    const { error } = await this.db.rpc("calendar_account_finish", { p_id: id, p_status: status, p_error: err });
    fail("calendar_account_finish", error);
  }

  async requestSync(id: string): Promise<void> {
    const { error } = await this.db.rpc("calendar_account_request_sync", { p_id: id });
    fail("calendar_account_request_sync", error);
  }

  async channelAccount(channelId: string, token: string): Promise<string | null> {
    const { data, error } = await this.db.rpc("calendar_channel_account", { p_channel: channelId, p_token: token });
    fail("calendar_channel_account", error);
    return (data as string | null) ?? null;
  }

  /** Returns the sealed refresh token for revocation, or null when there was no such account for this person. */
  async disconnect(id: string, userId: string): Promise<string | null> {
    const { data, error } = await this.db.rpc("calendar_account_disconnect", { p_id: id, p_user: userId });
    fail("calendar_account_disconnect", error);
    return (data as string | null) ?? null;
  }

  async calendarsOf(accountId: string): Promise<CalendarRow[]> {
    const { data, error } = await this.db.from("calendars").select("id, external_id, summary, read, write_target, sync_token, deleted_at").eq("calendar_account_id", accountId);
    fail("calendars select", error);
    return (data ?? []) as CalendarRow[];
  }

  async upsertCalendars(rows: CalendarUpsert[]): Promise<void> {
    // Known rows are updated column by column so a person's `read`, `private` and
    // `write_target` choices survive; only new rows get the default `read`.
    for (const r of rows) {
      if (r.id) {
        const { error } = await this.db.from("calendars").update({ summary: r.summary, timezone: r.timezone, color: r.color, access_role: r.access_role, deleted_at: null }).eq("id", r.id);
        fail("calendars update", error);
      }
    }
    const fresh = rows.filter((r) => !r.id);
    if (fresh.length) {
      const { error } = await this.db.from("calendars").insert(fresh);
      fail("calendars insert", error);
    }
  }

  async softDeleteCalendars(ids: string[]): Promise<void> {
    const at = new Date().toISOString();
    const { error } = await this.db.from("calendars").update({ deleted_at: at, write_target: false }).in("id", ids);
    fail("calendars soft delete", error);
    const events = await this.db.from("calendar_events").update({ deleted_at: at }).in("calendar_id", ids).is("deleted_at", null);
    fail("calendar_events soft delete", events.error);
  }
}
