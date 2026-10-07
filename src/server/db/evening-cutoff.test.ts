// The evening cut-off (20261007153000): every account starts with This Evening ending at 22:00 (PRODUCT_SPEC.md §24
// A5), the person can move it, and it is a time of day like the evening start.
import { describe, expect, it } from "vitest";
import { asUser, inTx, newUser, tryConnect } from "./test-db";

const admin = await tryConnect();

describe.skipIf(admin === null)("evening cut-off contract", () => {
  it("a new account's evening ends at 22:00 and starts at 18:00", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "evening-cutoff-a@contract.test");
      const { rows } = await c.query("select to_char(evening_starts_at, 'HH24:MI') as starts, to_char(evening_ends_at, 'HH24:MI') as ends from public.user_settings where user_id = $1", [me]);
      expect(rows[0]).toEqual({ starts: "18:00", ends: "22:00" });
    }));

  it("is the person's own column: they set it, and nonsense is refused", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "evening-cutoff-b@contract.test");
      await asUser(c, me);
      await c.query("update public.user_settings set evening_ends_at = '23:30' where user_id = $1", [me]);
      const { rows } = await c.query("select to_char(evening_ends_at, 'HH24:MI') as ends from public.user_settings where user_id = $1", [me]);
      expect(rows[0]).toEqual({ ends: "23:30" });
      await c.query("savepoint bad");
      await expect(c.query("update public.user_settings set evening_ends_at = 'late' where user_id = $1", [me])).rejects.toThrow();
      await c.query("rollback to savepoint bad");
      await expect(c.query("update public.user_settings set evening_ends_at = null where user_id = $1", [me])).rejects.toThrow(/null/);
    }));
});
