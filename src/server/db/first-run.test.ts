// The minimal first run (20261007171500): a new account starts with its first run ahead (onboarded_at null) and
// the Mon–Fri 09:00–18:00 week 1b proposes; the person stamps it done from the app, through the sync upload like
// any other settings write; the seeded dev account, which e2e and CI sign in as, is always done.
import { describe, expect, it } from "vitest";
import { asUser, inTx, newUser, tryConnect } from "./test-db";

const admin = await tryConnect();

type Applied = { r: { applied: string[]; rejected: { client_id: string; code: string }[] } };

describe.skipIf(admin === null)("first run contract", () => {
  it("a new account has its first run ahead and the week 1b proposes", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "first-run-a@contract.test");
      const { rows } = await c.query("select onboarded_at from public.user_settings where user_id = $1", [me]);
      expect(rows[0]).toEqual({ onboarded_at: null });
      const week = await c.query("select weekday, to_char(start_time, 'HH24:MI') as s, to_char(end_time, 'HH24:MI') as e from public.work_hours where user_id = $1 and deleted_at is null order by weekday", [me]);
      expect(week.rows).toEqual([0, 1, 2, 3, 4].map((weekday) => ({ weekday, s: "09:00", e: "18:00" })));
    }));

  it("the person stamps it done, and confirms the zone, through the sync upload", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "first-run-b@contract.test");
      const { rows } = await c.query<{ id: string }>("select id from public.user_settings where user_id = $1", [me]);
      await asUser(c, me);
      const ops = [{ op: "PATCH", table: "user_settings", id: rows[0].id, client_id: "c1", data: { timezone: "Europe/London", onboarded_at: "2026-10-07T09:00:00.000Z" } }];
      const r = (await c.query<Applied>("select public.apply_mutations('dev-1', $1::jsonb) as r", [JSON.stringify(ops)])).rows[0].r;
      expect(r).toEqual({ applied: ["c1"], rejected: [] });
      const after = await c.query("select timezone, onboarded_at is not null as done from public.user_settings where user_id = $1", [me]);
      expect(after.rows[0]).toEqual({ timezone: "Europe/London", done: true });
    }));

  it("the seeded dev account never sees it", () =>
    inTx(admin, async (c) => {
      const { rows } = await c.query<{ done: boolean }>(
        "select s.onboarded_at is not null as done from public.user_settings s join public.users u on u.id = s.user_id where u.email = 'dev@sparehour.local'",
      );
      // A database without the seed has no dev account to check.
      for (const row of rows) expect(row.done).toBe(true);
    }));
});
