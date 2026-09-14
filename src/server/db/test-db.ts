// Shared helpers for the database contract tests: a superuser connection to
// the local Supabase Postgres, a transaction that always rolls back, users
// provisioned through the real trigger, and PostgREST's per-request role and
// claims. Without a reachable database the suites skip, unless
// CONTRACT_TESTS=required (CI), in which case an unreachable database fails.
import { Client } from "pg";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const REQUIRED = process.env.CONTRACT_TESTS === "required";

export async function tryConnect(): Promise<Client | null> {
  const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    return client;
  } catch (error) {
    if (REQUIRED) throw error;
    return null;
  }
}

/** Every test runs in one transaction on the superuser connection and rolls back. */
export async function inTx(admin: Client | null, fn: (c: Client) => Promise<void>): Promise<void> {
  const c = admin as Client;
  await c.query("begin");
  try {
    await fn(c);
  } finally {
    await c.query("rollback");
  }
}

/** A fresh auth user; `handle_new_user` provisions the rest. */
export async function newUser(c: Client, email: string, timezone = "UTC"): Promise<string> {
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

export async function spaceOf(c: Client, uid: string): Promise<string> {
  const { rows } = await c.query<{ personal_space_id: string }>("select personal_space_id from public.users where id = $1", [uid]);
  return rows[0].personal_space_id;
}

/** What PostgREST does per request: the `authenticated` role plus the JWT claims. */
export async function asUser(c: Client, uid: string): Promise<void> {
  await c.query("set local role authenticated");
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
}

export async function asAdmin(c: Client): Promise<void> {
  await c.query("reset role");
}
