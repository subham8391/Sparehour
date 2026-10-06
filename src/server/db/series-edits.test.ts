// Series edits against the real database (SYSTEM_DESIGN.md §5.2; migration
// 20261006220000): a missed occurrence moved "just this once" goes back to its
// rule when the rollover skips it, and an exception written under its stable
// id (core/recurrence/exception-id.ts) can be soft-deleted and written again
// through the upload path — inserted deleted and then cleared — without
// colliding with the one row Postgres keeps per series and occurrence.
import type { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { exceptionId } from "@/core/recurrence/exception-id";
import { asAdmin, asUser, inTx as inTxOn, newUser, spaceOf, tryConnect } from "./test-db";

const admin = await tryConnect();
const inTx = (fn: (c: Client) => Promise<void>) => inTxOn(admin, fn);

afterAll(async () => {
  await admin?.end();
});

async function todayFor(c: Client, uid: string): Promise<string> {
  const { rows } = await c.query<{ today: string }>(
    `select to_char((timezone(s.timezone, now()) - make_interval(hours => s.day_rollover_hour))::date, 'YYYY-MM-DD') as today from public.user_settings s where s.user_id = $1`,
    [uid],
  );
  return rows[0].today;
}
const plus = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(admin === null)("series edits", () => {
  it("a missed occurrence moved just this once is skipped back onto its rule, counted from the day it was scheduled", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "series-move@contract.test");
      const sid = await spaceOf(c, uid);
      const today = await todayFor(c, uid);
      // Every 2 weeks, scheduled 10 days ago, moved just this once to yesterday, missed: the next is 4 days ahead
      // (10 days ago + 14), not 13 (yesterday + 14).
      const { rows } = await c.query<{ id: string }>(
        `insert into public.tasks (space_id, title, state, do_date, miss_policy, recurrence_rule, recurrence_mode, sort_key, day_sort_key)
         values ($1, 'Water the ferns', 'active', $2::date, 'skip', 'FREQ=WEEKLY;INTERVAL=2', 'fixed', 'a0', 'a0') returning id`,
        [sid, plus(today, -1)],
      );
      const id = rows[0].id;
      await c.query("update public.tasks set recurrence_series_id = id where id = $1", [id]);
      await c.query("insert into public.recurrence_exceptions (space_id, series_id, occurrence_date, kind, moved_to) values ($1, $2, $3, 'move', $4)", [sid, id, plus(today, -10), plus(today, -1)]);
      await c.query("select private.run_rollover()");
      const after = await c.query<{ do_date: string }>("select to_char(do_date, 'YYYY-MM-DD') as do_date from public.tasks where id = $1", [id]);
      expect(after.rows[0].do_date).toBe(plus(today, 4));
    }));

  it("an exception under its stable id is written, soft-deleted and written again through the upload path", () =>
    inTx(async (c) => {
      const uid = await newUser(c, "series-ex@contract.test");
      const sid = await spaceOf(c, uid);
      const { rows } = await c.query<{ id: string }>(
        `insert into public.tasks (space_id, title, state, do_date, recurrence_rule, recurrence_mode, sort_key) values ($1, 'Stand-up notes', 'active', '2026-10-12', 'FREQ=WEEKLY;BYDAY=MO', 'fixed', 'a0') returning id`,
        [sid],
      );
      const series = rows[0].id;
      const exId = exceptionId(series, "2026-10-12");
      const apply = async (ops: unknown[]) =>
        (await c.query<{ r: { applied: string[]; rejected: unknown[] } }>("select public.apply_mutations('dev-series', $1::jsonb) as r", [JSON.stringify(ops)])).rows[0].r;
      await asUser(c, uid);
      const put = (client: string, data: Record<string, unknown>) => ({ op: "PUT", table: "recurrence_exceptions", id: exId, client_id: client, data });
      const patch = (client: string, data: Record<string, unknown>) => ({ op: "PATCH", table: "recurrence_exceptions", id: exId, client_id: client, data });
      // Just this once: inserted deleted, then cleared (SeriesRepo.writeException).
      let r = await apply([
        put("a1", { space_id: sid, series_id: series, occurrence_date: "2026-10-12", kind: "move", moved_to: "2026-10-14", deleted_at: "2026-10-06T10:00:00Z" }),
        patch("a2", { deleted_at: null }),
      ]);
      expect(r.rejected).toEqual([]);
      // Moved back to its own day: soft-deleted.
      r = await apply([patch("b1", { deleted_at: "2026-10-06T10:05:00Z" })]);
      expect(r.rejected).toEqual([]);
      // Another device (or this one, the row long gone from it) moves it again under the same id.
      r = await apply([
        put("c1", { space_id: sid, series_id: series, occurrence_date: "2026-10-12", kind: "move", moved_to: "2026-10-15", deleted_at: "2026-10-06T10:10:00Z" }),
        patch("c2", { deleted_at: null }),
      ]);
      expect(r.rejected).toEqual([]);
      await asAdmin(c);
      const live = await c.query("select kind, to_char(moved_to, 'YYYY-MM-DD') as moved_to, deleted_at from public.recurrence_exceptions where series_id = $1", [series]);
      expect(live.rows).toEqual([{ kind: "move", moved_to: "2026-10-15", deleted_at: null }]);
    }));
});
