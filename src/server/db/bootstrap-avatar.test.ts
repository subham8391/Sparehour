// The client version gate and the account picture (20261007190000): GET /api/bootstrap's min_client_version comes
// from private.app_config through public.min_client_version(), which anyone may call and nobody can change from the
// app; a sign-up through Google has its picture at once; the backfill fills only https pictures, only where none is
// set, and says how many.
import { describe, expect, it } from "vitest";
import { asUser, inTx, newUser, tryConnect } from "./test-db";

const admin = await tryConnect();

describe.skipIf(admin === null)("bootstrap and avatar contract", () => {
  it("min_client_version is null without a gate, then the configured build, for a signed-out caller too", () =>
    inTx(admin, async (c) => {
      await c.query("delete from private.app_config where key = 'min_client_version'");
      const read = async () => (await c.query<{ v: string | null }>("select public.min_client_version() as v")).rows[0].v;
      expect(await read()).toBeNull();
      await c.query("insert into private.app_config (key, value) values ('min_client_version', ' 2026.10.07.1900 ')");
      expect(await read()).toBe("2026.10.07.1900");
      await c.query("set local role anon");
      expect(await read()).toBe("2026.10.07.1900");
      // The table itself stays out of reach.
      await expect(c.query("select value from private.app_config")).rejects.toThrow(/permission denied/);
    }));

  it("a person can read the gate but not move it", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "gate-a@contract.test");
      await asUser(c, me);
      expect((await c.query<{ v: string | null }>("select public.min_client_version() as v")).rows).toHaveLength(1);
      await expect(c.query("insert into private.app_config (key, value) values ('min_client_version', '0')")).rejects.toThrow(/permission denied/);
    }));

  it("a Google sign-up has its picture from the first row", () =>
    inTx(admin, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
           confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
         values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'avatar-g@contract.test', '',
           '{"provider":"google","providers":["google"]}', '{"full_name":"Ada Lovelace","picture":"https://lh3.googleusercontent.com/a/ada"}', now(), now(),
           '', '', '', '', '', '', '', '')
         returning id`,
      );
      const row = (await c.query<{ avatar_url: string | null }>("select avatar_url from public.users where id = $1", [rows[0].id])).rows[0];
      expect(row.avatar_url).toBe("https://lh3.googleusercontent.com/a/ada");
    }));

  it("the backfill fills an https picture where none is set, and leaves a set one, a missing one and a non-https one", () =>
    inTx(admin, async (c) => {
      const missed = await newUser(c, "avatar-b@contract.test");
      const kept = await newUser(c, "avatar-c@contract.test");
      const unsafe = await newUser(c, "avatar-d@contract.test");
      const none = await newUser(c, "avatar-e@contract.test");
      await c.query("update auth.users set raw_user_meta_data = raw_user_meta_data || '{\"picture\": \"https://lh3.googleusercontent.com/a/b\"}' where id = $1", [missed]);
      await c.query("update auth.users set raw_user_meta_data = raw_user_meta_data || '{\"avatar_url\": \"https://lh3.googleusercontent.com/a/c\"}' where id = $1", [kept]);
      await c.query("update auth.users set raw_user_meta_data = raw_user_meta_data || '{\"avatar_url\": \"http://example.com/d.png\"}' where id = $1", [unsafe]);
      // As if the profile had been made before the picture was kept: the trigger is on auth.users, so this sticks.
      await c.query("update public.users set avatar_url = null where id = $1", [missed]);
      await c.query("update public.users set avatar_url = 'https://example.com/chosen.png' where id = $1", [kept]);
      const ids = [missed, kept, unsafe, none];
      const before = await c.query<{ n: number }>("select count(*)::int as n from public.users u join auth.users a on a.id = u.id where u.avatar_url is null and coalesce(a.raw_user_meta_data->>'avatar_url', a.raw_user_meta_data->>'picture', '') ~ '^https://'");
      const n = (await c.query<{ n: number }>("select private.backfill_user_avatars() as n")).rows[0].n;
      expect(n).toBe(before.rows[0].n);
      expect(n).toBeGreaterThanOrEqual(1);
      const after = await c.query<{ id: string; avatar_url: string | null }>("select id, avatar_url from public.users where id = any($1::uuid[])", [ids]);
      const by = Object.fromEntries(after.rows.map((r) => [r.id, r.avatar_url]));
      expect(by[missed]).toBe("https://lh3.googleusercontent.com/a/b");
      expect(by[kept]).toBe("https://example.com/chosen.png");
      expect(by[unsafe]).toBeNull();
      expect(by[none]).toBeNull();
      expect((await c.query<{ n: number }>("select private.backfill_user_avatars() as n")).rows[0].n).toBe(0);
    }));

  it("people cannot run the backfill", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "avatar-f@contract.test");
      await asUser(c, me);
      await expect(c.query("select private.backfill_user_avatars()")).rejects.toThrow(/permission denied/);
    }));
});
