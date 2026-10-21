// Lists' database contract (migration 20261022000100; DECISIONS.md, amendment 2026-10-22): the three tables take
// writes through apply_mutations like areas do, another person can neither read nor write them, a list never ends up
// inside itself or in another space, an item's link preview is the server's (and goes when the link changes), and a
// tag taken off can go back on.
import type { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, inTx as inTxOn, newUser, spaceOf, tryConnect } from "./test-db";

const admin = await tryConnect();
const inTx = (fn: (c: Client) => Promise<void>) => inTxOn(admin, fn);

interface ApplyResult {
  applied: string[];
  rejected: { client_id: string; code: string }[];
}

async function apply(c: Client, ops: Record<string, unknown>[]): Promise<ApplyResult> {
  const { rows } = await c.query<{ r: ApplyResult }>("select public.apply_mutations('dev-1', $1::jsonb) as r", [JSON.stringify(ops)]);
  return rows[0].r;
}

const uuid = () => crypto.randomUUID();
let n = 0;
const put = (table: string, id: string, data: Record<string, unknown>) => ({ client_id: `c${++n}`, op: "PUT", table, id, data });
const patch = (table: string, id: string, data: Record<string, unknown>) => ({ client_id: `c${++n}`, op: "PATCH", table, id, data });

describe.skipIf(admin === null)("lists contract", () => {
  afterAll(async () => {
    await admin?.end();
  });

  it("a person writes lists, items and tag links through apply_mutations; another person sees and changes none of it", () =>
    inTx(async (c) => {
      const me = await newUser(c, "lists-a@contract.test");
      const other = await newUser(c, "lists-b@contract.test");
      const sid = await spaceOf(c, me);
      const [anime, action, item, tag, link] = [uuid(), uuid(), uuid(), uuid(), uuid()];
      await asUser(c, me);
      const out = await apply(c, [
        put("lists", anime, { space_id: sid, name: "Anime", emoji: "🍥", sort_key: "a0" }),
        put("lists", action, { space_id: sid, parent_id: anime, name: "Action", sort_key: "a0" }),
        put("list_items", item, { space_id: sid, list_id: action, title: "Attack on Titan", status: "doing", rating: 5, sort_key: "a0" }),
        put("tags", tag, { space_id: sid, name: "recommended" }),
        put("list_item_tags", link, { space_id: sid, item_id: item, tag_id: tag }),
      ]);
      expect(out.rejected).toEqual([]);
      expect((await c.query("select status, rating from public.list_items where id = $1", [item])).rows[0]).toEqual({ status: "doing", rating: 5 });

      // A rating out of range and an unknown status are refused by the table.
      const bad = await apply(c, [patch("list_items", item, { rating: 9 }), patch("list_items", item, { status: "maybe" })]);
      expect(bad.rejected.map((r) => r.code)).toEqual(["23514", "23514"]);

      await asAdmin(c);
      await asUser(c, other);
      expect((await c.query("select id from public.lists")).rows).toEqual([]);
      expect((await c.query("select id from public.list_items")).rows).toEqual([]);
      const theirs = await apply(c, [patch("lists", anime, { name: "Mine now" }), patch("list_items", item, { title: "Mine now" })]);
      expect(theirs.rejected).toHaveLength(2);
      await asAdmin(c);
      expect((await c.query("select name from public.lists where id = $1", [anime])).rows[0].name).toBe("Anime");
    }));

  it("a list never ends up inside itself, however deep, nor under a list of another space", () =>
    inTx(async (c) => {
      const me = await newUser(c, "lists-c@contract.test");
      const other = await newUser(c, "lists-d@contract.test");
      const sid = await spaceOf(c, me);
      const theirSpace = await spaceOf(c, other);
      const [a, b, cc, foreign] = [uuid(), uuid(), uuid(), uuid()];
      await c.query("insert into public.lists (id, space_id, name, sort_key) values ($1, $2, 'Theirs', 'a0')", [foreign, theirSpace]);
      await asUser(c, me);
      expect(
        (
          await apply(c, [
            put("lists", a, { space_id: sid, name: "A", sort_key: "a0" }),
            put("lists", b, { space_id: sid, parent_id: a, name: "B", sort_key: "a0" }),
            put("lists", cc, { space_id: sid, parent_id: b, name: "C", sort_key: "a0" }),
          ])
        ).rejected,
      ).toEqual([]);
      const loop = await apply(c, [patch("lists", a, { parent_id: cc }), patch("lists", a, { parent_id: a }), patch("lists", b, { parent_id: foreign })]);
      expect(loop.rejected.map((r) => r.code)).toEqual(["23514", "23514", "23514"]);
      await asAdmin(c);
      expect((await c.query("select parent_id from public.lists where id = $1", [a])).rows[0].parent_id).toBeNull();
    }));

  it("an item's link preview is the server's: a person's value is dropped, the service role's is kept", () =>
    inTx(async (c) => {
      const me = await newUser(c, "lists-e@contract.test");
      const sid = await spaceOf(c, me);
      const [list, item] = [uuid(), uuid()];
      await asUser(c, me);
      await apply(c, [
        put("lists", list, { space_id: sid, name: "Reading", sort_key: "a0" }),
        put("list_items", item, { space_id: sid, list_id: list, title: "An article", url: "https://example.com/a", preview_title: "Fake", sort_key: "a0" }),
      ]);
      await apply(c, [patch("list_items", item, { preview_image: "https://evil.example/x.png" })]);
      await asAdmin(c);
      expect((await c.query("select preview_title, preview_image from public.list_items where id = $1", [item])).rows[0]).toEqual({ preview_title: null, preview_image: null });
      await c.query("set local role service_role");
      await c.query("update public.list_items set preview_title = 'An article — Example', preview_fetched_at = now() where id = $1", [item]);
      await asAdmin(c);
      expect((await c.query("select preview_title from public.list_items where id = $1", [item])).rows[0].preview_title).toBe("An article — Example");

      // A new link takes the old preview with it; the same link written again keeps it.
      await asUser(c, me);
      await apply(c, [patch("list_items", item, { url: "https://example.com/a", title: "An article, renamed" })]);
      await asAdmin(c);
      expect((await c.query("select preview_title from public.list_items where id = $1", [item])).rows[0].preview_title).toBe("An article — Example");
      await asUser(c, me);
      await apply(c, [patch("list_items", item, { url: "https://example.com/b" })]);
      await asAdmin(c);
      expect((await c.query("select preview_title, preview_fetched_at from public.list_items where id = $1", [item])).rows[0]).toEqual({ preview_title: null, preview_fetched_at: null });
    }));

  it("a tag taken off an item can go back on as a new link (unique among live links only)", () =>
    inTx(async (c) => {
      const me = await newUser(c, "lists-f@contract.test");
      const sid = await spaceOf(c, me);
      const [list, item, tag, first, second] = [uuid(), uuid(), uuid(), uuid(), uuid()];
      await asUser(c, me);
      const out = await apply(c, [
        put("lists", list, { space_id: sid, name: "Watch", sort_key: "a0" }),
        put("list_items", item, { space_id: sid, list_id: list, title: "Dune", sort_key: "a0" }),
        put("tags", tag, { space_id: sid, name: "scifi" }),
        put("list_item_tags", first, { space_id: sid, item_id: item, tag_id: tag }),
        patch("list_item_tags", first, { deleted_at: new Date().toISOString() }),
        put("list_item_tags", second, { space_id: sid, item_id: item, tag_id: tag }),
      ]);
      expect(out.rejected).toEqual([]);
      await asAdmin(c);
      expect((await c.query("select count(*)::int as n from public.list_item_tags where item_id = $1 and deleted_at is null", [item])).rows[0].n).toBe(1);
    }));
});
