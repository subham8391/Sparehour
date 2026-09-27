// The morning review's columns (20260927000100): a signed-in person can write
// their own carry_review switch and stamp their own day's carry_reviewed_at,
// directly and through the upload path, and nobody else's.
import { describe, expect, it } from "vitest";
import { asAdmin, asUser, inTx, newUser, spaceOf, tryConnect } from "./test-db";

const admin = await tryConnect();

describe.skipIf(admin === null)("carry review contract", () => {
  it("carry_review is on by default and a person can switch it off and on", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "review-a@contract.test");
      expect((await c.query("select carry_review from public.user_settings where user_id = $1", [me])).rows[0]).toEqual({ carry_review: true });
      await asUser(c, me);
      await c.query("update public.user_settings set carry_review = false where user_id = $1", [me]);
      expect((await c.query("select carry_review from public.user_settings where user_id = $1", [me])).rows[0]).toEqual({ carry_review: false });
      await c.query("update public.user_settings set carry_review = true where user_id = $1", [me]);
      expect((await c.query("select carry_review from public.user_settings where user_id = $1", [me])).rows[0]).toEqual({ carry_review: true });
    }));

  it("a person stamps carry_reviewed_at on their own day plan, creating the row or updating it", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "review-b@contract.test");
      const mine = await spaceOf(c, me);
      await asUser(c, me);
      const { rows } = await c.query<{ id: string }>("insert into public.day_plans (space_id, user_id, date, carry_reviewed_at) values ($1, $2, current_date, now()) returning id", [mine, me]);
      const id = rows[0].id;
      expect((await c.query("select carry_reviewed_at is not null as stamped, planned_at, shutdown_at from public.day_plans where id = $1", [id])).rows[0]).toEqual({ stamped: true, planned_at: null, shutdown_at: null });
      await c.query("update public.day_plans set carry_reviewed_at = null where id = $1", [id]);
      expect((await c.query("select carry_reviewed_at from public.day_plans where id = $1", [id])).rows[0]).toEqual({ carry_reviewed_at: null });
      await c.query("update public.day_plans set carry_reviewed_at = '2026-09-27T08:05:00Z' where id = $1", [id]);
      expect((await c.query("select carry_reviewed_at from public.day_plans where id = $1", [id])).rows[0].carry_reviewed_at.toISOString()).toBe("2026-09-27T08:05:00.000Z");
    }));

  it("the upload path carries both columns as the person, and another person's rows stay out of reach", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "review-c@contract.test");
      const other = await newUser(c, "review-d@contract.test");
      const mine = await spaceOf(c, me);
      const settingsId = (await c.query<{ id: string }>("select id from public.user_settings where user_id = $1", [me])).rows[0].id;
      const theirSettingsId = (await c.query<{ id: string }>("select id from public.user_settings where user_id = $1", [other])).rows[0].id;
      await asUser(c, me);
      const planId = "44444444-4444-4444-8444-444444444444";
      const ops = [
        { op: "PATCH", table: "user_settings", id: settingsId, client_id: "s1", data: { carry_review: false } },
        { op: "PUT", table: "day_plans", id: planId, client_id: "p1", data: { space_id: mine, user_id: me, date: "2026-09-27", carry_reviewed_at: "2026-09-27T08:05:00Z" } },
        { op: "PATCH", table: "user_settings", id: theirSettingsId, client_id: "s2", data: { carry_review: false } },
      ];
      const r = (await c.query<{ r: { applied: string[]; rejected: { client_id: string; code: string }[] } }>("select public.apply_mutations('dev-1', $1::jsonb) as r", [JSON.stringify(ops)])).rows[0].r;
      expect(r.applied).toEqual(["s1", "p1"]);
      expect(r.rejected.map((x) => x.client_id)).toEqual(["s2"]);
      expect((await c.query("select carry_review from public.user_settings where id = $1", [settingsId])).rows[0]).toEqual({ carry_review: false });
      expect((await c.query("select carry_reviewed_at is not null as stamped from public.day_plans where id = $1", [planId])).rows[0]).toEqual({ stamped: true });
      await asAdmin(c);
      expect((await c.query("select carry_review from public.user_settings where id = $1", [theirSettingsId])).rows[0]).toEqual({ carry_review: true });
    }));
});
