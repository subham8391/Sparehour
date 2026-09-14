// Database contract tests (SYSTEM_DESIGN.md §12.2): the rules the client and
// the sync path rely on — RLS as the tenant boundary, apply_mutations running
// as the caller with an idempotency ledger, and the provisioning/touch
// triggers. They run against the local Supabase stack (`npx supabase start`,
// Postgres on 54322) inside transactions that are always rolled back, so the
// seeded database is untouched. Without a reachable database they are
// skipped; CI sets CONTRACT_TESTS=required so an unreachable database fails.
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const REQUIRED = process.env.CONTRACT_TESTS === "required";

async function tryConnect(): Promise<Client | null> {
  const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    return client;
  } catch (error) {
    if (REQUIRED) throw error;
    return null;
  }
}

const admin = await tryConnect();

/** Every test runs in one transaction on the superuser connection and rolls back. */
async function inTx(fn: (c: Client) => Promise<void>): Promise<void> {
  const c = admin as Client;
  await c.query("begin");
  try {
    await fn(c);
  } finally {
    await c.query("rollback");
  }
}

/** A fresh auth user; `handle_new_user` provisions the rest. */
async function newUser(c: Client, email: string, timezone = "UTC"): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into auth.users (
       id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
       phone_change, phone_change_token, reauthentication_token
     ) values (
       gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1,
       crypt('contract', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('timezone', $2::text), now(), now(),
       '', '', '', '', '', '', '', ''
     ) returning id`,
    [email, timezone],
  );
  return rows[0].id;
}

async function spaceOf(c: Client, uid: string): Promise<string> {
  const { rows } = await c.query<{ personal_space_id: string }>("select personal_space_id from public.users where id = $1", [uid]);
  return rows[0].personal_space_id;
}

/** What PostgREST does per request: the `authenticated` role plus the JWT claims. */
async function asUser(c: Client, uid: string): Promise<void> {
  await c.query("set local role authenticated");
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
}

async function asAdmin(c: Client): Promise<void> {
  await c.query("reset role");
}

interface ApplyResult {
  applied: string[];
  rejected: { client_id: string; code: string }[];
}

async function apply(c: Client, device: string, ops: Record<string, unknown>[]): Promise<ApplyResult> {
  const { rows } = await c.query<{ r: ApplyResult }>("select public.apply_mutations($1, $2::jsonb) as r", [device, JSON.stringify(ops)]);
  return rows[0].r;
}

const uuid = () => crypto.randomUUID();
const put = (client_id: string, id: string, data: Record<string, unknown>, table = "tasks") => ({ client_id, op: "PUT", table, id, data });
const patch = (client_id: string, id: string, data: Record<string, unknown>, table = "tasks") => ({ client_id, op: "PATCH", table, id, data });

describe.skipIf(admin === null)("database contract (local Supabase)", () => {
  afterAll(async () => {
    await admin?.end();
  });

  it("provisions a new user: personal space, ownership, settings in their timezone, Mon–Fri 09:00–18:00", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "a@contract.test", "Asia/Kolkata");
      const sid = await spaceOf(c, uid);
      expect(sid).toBeTruthy();

      const space = await c.query("select kind, owner_id from public.spaces where id = $1", [sid]);
      expect(space.rows[0]).toMatchObject({ kind: "personal", owner_id: uid });

      const member = await c.query("select role, joined_at from public.space_members where space_id = $1 and user_id = $2", [sid, uid]);
      expect(member.rows[0].role).toBe("owner");
      expect(member.rows[0].joined_at).not.toBeNull();

      const settings = await c.query("select timezone from public.user_settings where user_id = $1", [uid]);
      expect(settings.rows[0].timezone).toBe("Asia/Kolkata");

      const hours = await c.query<{ weekday: number; start_time: string; end_time: string }>(
        "select weekday, start_time::text, end_time::text from public.work_hours where user_id = $1 order by weekday",
        [uid],
      );
      expect(hours.rows.map((h) => h.weekday)).toEqual([0, 1, 2, 3, 4]);
      expect(hours.rows.every((h) => h.start_time.startsWith("09:00") && h.end_time.startsWith("18:00"))).toBe(true);
    }));

  it("RLS: a user only sees rows in their own spaces", () =>
    inTx(async (c) => {
      const a = await newUser(c, "a@contract.test");
      const b = await newUser(c, "b@contract.test");
      const sidA = await spaceOf(c, a);

      await asUser(c, a);
      await c.query("insert into public.tasks (space_id, title, sort_key) values ($1, 'A''s task', 'a0')", [sidA]);
      const mine = await c.query("select count(*)::int as n from public.tasks");
      expect(mine.rows[0].n).toBe(1);

      await asUser(c, b);
      const theirs = await c.query("select count(*)::int as n from public.tasks");
      expect(theirs.rows[0].n).toBe(0);
      const users = await c.query("select id from public.users");
      expect(users.rows.map((r) => r.id)).toEqual([b]);
      const spaces = await c.query("select count(*)::int as n from public.spaces");
      expect(spaces.rows[0].n).toBe(1);
    }));

  it("RLS: a user cannot change or delete another user's task", () =>
    inTx(async (c) => {
      const a = await newUser(c, "a@contract.test");
      const b = await newUser(c, "b@contract.test");
      const sidA = await spaceOf(c, a);
      const taskId = uuid();

      await asUser(c, a);
      await c.query("insert into public.tasks (id, space_id, title, sort_key) values ($1, $2, 'private', 'a0')", [taskId, sidA]);

      await asUser(c, b);
      const upd = await c.query("update public.tasks set title = 'hacked' where id = $1", [taskId]);
      expect(upd.rowCount).toBe(0);
      const del = await c.query("delete from public.tasks where id = $1", [taskId]);
      expect(del.rowCount).toBe(0);

      await asUser(c, a);
      const row = await c.query("select title from public.tasks where id = $1", [taskId]);
      expect(row.rows[0].title).toBe("private");
    }));

  it("apply_mutations applies a PUT as the caller and treats a replay as already applied", () =>
    inTx(async (c) => {
      const a = await newUser(c, "a@contract.test");
      const sidA = await spaceOf(c, a);
      const taskId = uuid();
      await asUser(c, a);

      const first = await apply(c, "device-1", [put("1", taskId, { space_id: sidA, title: "first", sort_key: "a0" })]);
      expect(first).toEqual({ applied: ["1"], rejected: [] });
      expect((await c.query("select title, source from public.tasks where id = $1", [taskId])).rows[0]).toMatchObject({ title: "first", source: "quickadd" });

      // same device + client_id: acknowledged, not re-applied
      const replay = await apply(c, "device-1", [put("1", taskId, { space_id: sidA, title: "second", sort_key: "a0" })]);
      expect(replay).toEqual({ applied: ["1"], rejected: [] });
      expect((await c.query("select title from public.tasks where id = $1", [taskId])).rows[0].title).toBe("first");
      const ledger = await c.query("select result from private.mutations where mutation_id = 'device-1:1'");
      expect(ledger.rows).toEqual([{ result: "applied" }]);

      // another device reusing the client_id is a different mutation
      const other = await apply(c, "device-2", [put("1", taskId, { space_id: sidA, title: "second", sort_key: "a0" })]);
      expect(other.applied).toEqual(["1"]);
      expect((await c.query("select title from public.tasks where id = $1", [taskId])).rows[0].title).toBe("second");
    }));

  it("apply_mutations rejects cross-tenant writes per op and applies the rest of the batch", () =>
    inTx(async (c) => {
      const a = await newUser(c, "a@contract.test");
      const b = await newUser(c, "b@contract.test");
      const sidA = await spaceOf(c, a);
      const sidB = await spaceOf(c, b);
      const taskA = uuid();
      const taskB = uuid();
      const intruder = uuid();

      await asUser(c, a);
      await apply(c, "device-a", [put("1", taskA, { space_id: sidA, title: "A's task", sort_key: "a0" })]);

      await asUser(c, b);
      const r = await apply(c, "device-b", [
        patch("1", taskA, { title: "hacked" }),
        put("2", taskB, { space_id: sidB, title: "B's task", sort_key: "a0" }),
        put("3", intruder, { space_id: sidA, title: "planted in A's space", sort_key: "a1" }),
      ]);
      expect(r.applied).toEqual(["2"]);
      expect(r.rejected).toEqual([
        { client_id: "1", code: "42501" },
        { client_id: "3", code: "42501" },
      ]);
      const ledger = await c.query("select mutation_id, result from private.mutations where mutation_id like 'device-b:%' order by 1");
      expect(ledger.rows).toEqual([
        { mutation_id: "device-b:1", result: "rejected" },
        { mutation_id: "device-b:2", result: "applied" },
        { mutation_id: "device-b:3", result: "rejected" },
      ]);

      await asUser(c, a);
      expect((await c.query("select title from public.tasks where id = $1", [taskA])).rows[0].title).toBe("A's task");
      expect((await c.query("select count(*)::int as n from public.tasks where space_id = $1", [sidA])).rows[0].n).toBe(1);
    }));

  it("apply_mutations refuses tables outside the allow-list and anonymous callers", () =>
    inTx(async (c) => {
      const a = await newUser(c, "a@contract.test");
      const sidA = await spaceOf(c, a);
      await asUser(c, a);

      const r = await apply(c, "device-a", [put("1", uuid(), { space_id: sidA, summary: "fake meeting" }, "calendar_events")]);
      expect(r).toEqual({ applied: [], rejected: [{ client_id: "1", code: "table_not_allowed" }] });
      expect((await c.query("select count(*)::int as n from public.calendar_events where space_id = $1", [sidA])).rows[0].n).toBe(0);

      await c.query("set local role anon");
      await expect(apply(c, "device-x", [put("1", uuid(), { space_id: sidA, title: "x", sort_key: "a0" })])).rejects.toMatchObject({ code: "42501" });
    }));

  it("server bookkeeping (carry_count, last_carried_at) does not count as a touch; user edits do", () =>
    inTx(async (c) => {
      const a = await newUser(c, "a@contract.test");
      const sidA = await spaceOf(c, a);
      const taskId = uuid();
      await asUser(c, a);
      await apply(c, "device-a", [put("1", taskId, { space_id: sidA, title: "touch me", sort_key: "a0", last_touched_at: "2020-01-01T00:00:00Z" })]);
      const touched = async () => (await c.query("select last_touched_at from public.tasks where id = $1", [taskId])).rows[0].last_touched_at as Date;
      expect((await touched()).toISOString()).toBe("2020-01-01T00:00:00.000Z");

      await asAdmin(c);
      await c.query("update public.tasks set carry_count = 3, last_carried_at = current_date where id = $1", [taskId]);
      expect((await touched()).toISOString()).toBe("2020-01-01T00:00:00.000Z");

      await asUser(c, a);
      await apply(c, "device-a", [patch("2", taskId, { title: "renamed" })]);
      expect((await touched()).getTime()).toBeGreaterThan(Date.UTC(2020, 0, 2));
    }));
});
