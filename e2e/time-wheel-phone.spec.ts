// Times on a phone (DECISIONS.md, amendment 2026-10-23): a tap on a time box opens the wheel, never the keyboard;
// a flick of the hours settles on a row, a chip moves the time, Set saves it to Postgres and the box shows it; Cancel
// changes nothing. The dev account's working hours are read before and put back exactly afterwards (a raw write, so
// the triggers do not move updated_at), as e2e/settings.spec.ts does.
import { expect, test } from "./fixtures";
import { devAccount, waitForRow, withDb, type DevAccount } from "./db";
import { DEV_USER, openApp } from "./helpers";

interface HoursRow {
  id: string;
  start_time: string;
  end_time: string;
  deleted_at: string | null;
  updated_at: string;
}

let me: DevAccount;
let before: HoursRow[] = [];

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
    before = (await c.query<HoursRow>("select id, start_time::text, end_time::text, deleted_at::text, updated_at::text from public.work_hours where user_id = $1", [me.uid])).rows;
    // Monday is a working day from 09:00 for this test, whatever the account had.
    await c.query("update public.work_hours set start_time = '09:00' where user_id = $1 and weekday = 0 and deleted_at is null", [me.uid]);
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await c.query("begin");
    try {
      await c.query("set local session_replication_role = replica");
      await c.query("delete from public.work_hours where user_id = $1 and not (id = any($2::uuid[]))", [me.uid, before.map((r) => r.id)]);
      if (before.length > 0) {
        await c.query(
          `update public.work_hours w set start_time = v.st, end_time = v.et, deleted_at = v.da, updated_at = v.ua
             from unnest($1::uuid[], $2::time[], $3::time[], $4::timestamptz[], $5::timestamptz[]) as v(id, st, et, da, ua) where w.id = v.id`,
          [before.map((r) => r.id), before.map((r) => r.start_time), before.map((r) => r.end_time), before.map((r) => r.deleted_at), before.map((r) => r.updated_at)],
        );
      }
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  });
});

test("a tap opens the wheel, not the keyboard; Set saves the time and Cancel keeps it", async ({ page }) => {
  await openApp(page, "/settings#working-hours");
  const box = page.getByRole("textbox", { name: "Monday start", exact: true });
  await expect(box).toHaveValue("09:00");
  await expect(box).toHaveAttribute("inputmode", "none");
  await box.tap();
  const sheet = page.getByRole("dialog", { name: "Choose Monday start" });
  await expect(sheet).toBeVisible();

  // A flick on the hours: it settles on a whole row, and the readout and Set follow it.
  const hours = sheet.getByRole("spinbutton", { name: "Hours" });
  await hours.evaluate((el) => el.scrollBy({ top: 44 * 2 }));
  await expect(hours).toHaveAttribute("aria-valuetext", "11");
  await sheet.getByRole("button", { name: "+15m" }).tap();
  await sheet.getByRole("button", { name: "Set 11:15" }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(box).toHaveValue("11:15");
  expect(await waitForRow("select 1 from public.work_hours where user_id = $1 and weekday = 0 and deleted_at is null and start_time = '11:15'", [me.uid])).not.toBeNull();

  // Cancel changes nothing.
  await box.tap();
  await sheet.getByRole("button", { name: "−15m" }).tap();
  await sheet.getByRole("button", { name: "Cancel" }).tap();
  await expect(box).toHaveValue("11:15");
});
