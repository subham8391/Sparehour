// What the database already does for an Outlook account, with no migration (DECISIONS.md, amendment 2026-11-15;
// SYSTEM_DESIGN.md §6.8 "As built"): the account is taken as provider 'microsoft' beside a Google one, its flags
// come out as "busy times, nothing written", the worker's claim says whose it is, no block is ever handed to the
// writer for one of its calendars, a Graph delta link fits where the sync token goes, and a disconnect lets it go.
import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { asAdmin, asUser, inTx, newUser, tryConnect } from "./test-db";

const admin = await tryConnect();
const OUTLOOK_SCOPES = ["openid", "email", "Calendars.ReadBasic"];
const GOOGLE_OWNED = "https://www.googleapis.com/auth/calendar.events.owned";

const connect = async (c: Client, uid: string, provider: string, external: string, email: string, scopes: string[]) =>
  (await c.query<{ id: string }>("select public.calendar_account_connect($1, $2, $3, $4, 'cg==', 'YQ==', now() + interval '1 hour', $5, 1) as id", [uid, provider, external, email, scopes])).rows[0].id;
const connection = async (c: Client, id: string) => (await c.query("select provider, email, status, can_write, can_read_titles, can_write_own from public.calendar_connections where id = $1", [id])).rows[0];
const calendar = async (c: Client, sid: string, uid: string, aid: string, externalId: string, summary: string, writeTarget = false) =>
  (await c.query<{ id: string }>("insert into public.calendars (space_id, user_id, calendar_account_id, external_id, summary, access_role, write_target) values ($1, $2, $3, $4, $5, 'owner', $6) returning id", [sid, uid, aid, externalId, summary, writeTarget])).rows[0].id;
const spaceOf = async (c: Client, uid: string) => (await c.query<{ s: string }>("select personal_space_id as s from public.users where id = $1", [uid])).rows[0].s;
const claimPush = async (c: Client, uid: string) => (await c.query("select id from public.time_blocks_claim_push($1, 10)", [uid])).rows;

describe.skipIf(admin === null)("an Outlook account in the database, as it stands", () => {
  it("connects as provider 'microsoft' beside a Google account, reads busy times only, and may write nothing", () =>
    inTx(admin, async (c) => {
      const uid = await newUser(c, "outlook-a@contract.test");
      const google = await connect(c, uid, "google", "same-id", "sam@gmail.com", [GOOGLE_OWNED]);
      const outlook = await connect(c, uid, "microsoft", "same-id", "sam@contoso.com", OUTLOOK_SCOPES);
      expect(outlook).not.toBe(google); // the provider is part of what makes an account
      expect(await connection(c, outlook)).toEqual({ provider: "microsoft", email: "sam@contoso.com", status: "ok", can_write: false, can_read_titles: false, can_write_own: false });
      expect(await connection(c, google)).toMatchObject({ provider: "google", can_write: true, can_write_own: true });
      // A reconnect is the same account, and its flags stay as they were.
      expect(await connect(c, uid, "microsoft", "same-id", "sam@contoso.com", OUTLOOK_SCOPES)).toBe(outlook);
      expect(await connection(c, outlook)).toMatchObject({ can_write: false, can_read_titles: false, can_write_own: false });
      // The person sees the connection, and its provider, through their own session.
      await asUser(c, uid);
      expect((await c.query("select provider from public.calendar_connections order by provider")).rows.map((r) => r.provider)).toEqual(["google", "microsoft"]);
      await asAdmin(c);
    }));

  it("the worker's claim hands the account over with its provider, its sealed tokens and its scopes", () =>
    inTx(admin, async (c) => {
      const uid = await newUser(c, "outlook-b@contract.test");
      const outlook = await connect(c, uid, "microsoft", "ms-sub", "sam@contoso.com", OUTLOOK_SCOPES);
      const { rows } = await c.query("select id, provider, external_account, refresh_b64, access_b64, scopes, status from public.calendar_accounts_claim($1, 5, true, null)", [uid]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: outlook, provider: "microsoft", external_account: "ms-sub", refresh_b64: "cg==", access_b64: "YQ==", status: "ok" });
      expect([...rows[0].scopes].sort()).toEqual([...OUTLOOK_SCOPES].sort());
    }));

  it("no block is ever handed to the writer for an Outlook calendar, even one marked as where blocks go", () =>
    inTx(admin, async (c) => {
      const uid = await newUser(c, "outlook-c@contract.test");
      const sid = await spaceOf(c, uid);
      const outlook = await connect(c, uid, "microsoft", "ms-sub", "sam@contoso.com", OUTLOOK_SCOPES);
      // Not something the app offers; set here by hand, as a stale or tampered client might.
      await calendar(c, sid, uid, outlook, "AAMkAGI2TGuLAAA=", "Calendar", true);
      await c.query("insert into public.time_blocks (space_id, user_id, title, start_at, end_at) values ($1, $2, 'Deep work', '2026-11-16 09:00+00', '2026-11-16 10:00+00')", [sid, uid]);
      expect((await c.query("select * from private.write_calendar_of($1)", [uid])).rows).toHaveLength(0);
      expect(await claimPush(c, uid)).toHaveLength(0);

      // With a Google account that may write, and its calendar chosen instead, the same block is claimed for Google's.
      const google = await connect(c, uid, "google", "g", "sam@gmail.com", [GOOGLE_OWNED]);
      await c.query("update public.calendars set write_target = false where user_id = $1", [uid]);
      const work = await calendar(c, sid, uid, google, "primary", "Work", true);
      const target = (await c.query("select calendar_id, external_calendar_id, account_id from private.write_calendar_of($1)", [uid])).rows;
      expect(target).toEqual([{ calendar_id: work, external_calendar_id: "primary", account_id: google }]);
      expect(await claimPush(c, uid)).toHaveLength(1);
    }));

  it("a Graph delta link with its day fits in the sync token, and an Outlook event is mirrored with its times and no title", () =>
    inTx(admin, async (c) => {
      const uid = await newUser(c, "outlook-d@contract.test");
      const sid = await spaceOf(c, uid);
      const outlook = await connect(c, uid, "microsoft", "ms-sub", "sam@contoso.com", OUTLOOK_SCOPES);
      const cal = await calendar(c, sid, uid, outlook, "AAMkAGI2TGuLAAA=", "Calendar");
      const token = `2026-11-15|https://graph.microsoft.com/v1.0/me/calendars('AAMkAGI2TGuLAAA=')/calendarView/delta?$deltatoken=${"R0usmcMDNGg0J1E".repeat(40)}`;
      await c.query("update public.calendars set sync_token = $1 where id = $2", [token, cal]);
      expect((await c.query("select sync_token from public.calendars where id = $1", [cal])).rows[0].sync_token).toBe(token);
      const eventId = `AAMkADk0MGFkODE3LWE4MmYtNDRhOS04OGQ${"x".repeat(120)}AAA=`;
      await c.query(
        "insert into public.calendar_events (space_id, user_id, calendar_id, external_id, summary, start_at, end_at, all_day, busy, status, self_response, event_type, is_ours, etag) values ($1, $2, $3, $4, null, '2026-11-16 09:30+00', '2026-11-16 10:00+00', false, true, 'confirmed', 'accepted', 'default', false, $5)",
        [sid, uid, cal, eventId, 'W/"EZ9r3czxY0m2jz8c45czkwAAFXcvIQ=="'],
      );
      await asUser(c, uid);
      expect((await c.query("select external_id, summary, busy, self_response from public.calendar_events where calendar_id = $1", [cal])).rows).toEqual([{ external_id: eventId, summary: null, busy: true, self_response: "accepted" }]);
      await asAdmin(c);
    }));

  it("a disconnect hands back the sealed token, drops the connection and soft-deletes the mirror; only for its owner", () =>
    inTx(admin, async (c) => {
      const uid = await newUser(c, "outlook-e@contract.test");
      const other = await newUser(c, "outlook-f@contract.test");
      const sid = await spaceOf(c, uid);
      const outlook = await connect(c, uid, "microsoft", "ms-sub", "sam@contoso.com", OUTLOOK_SCOPES);
      const cal = await calendar(c, sid, uid, outlook, "AAMkAGI2TGuLAAA=", "Calendar");
      expect((await c.query("select public.calendar_account_disconnect($1, $2) as t", [outlook, other])).rows[0].t).toBeNull();
      // The provider is still readable just before, which is when the route reads it.
      expect((await connection(c, outlook)).provider).toBe("microsoft");
      expect((await c.query("select public.calendar_account_disconnect($1, $2) as t", [outlook, uid])).rows[0].t).toBe("cg==");
      expect(await connection(c, outlook)).toBeUndefined();
      expect((await c.query("select deleted_at is not null as gone from public.calendars where id = $1", [cal])).rows[0].gone).toBe(true);
      expect((await c.query("select count(*)::int as n from public.calendar_accounts_claim($1, 5, true, null)", [uid])).rows[0].n).toBe(0);
    }));
});
