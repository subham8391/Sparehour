// Someday (SCREENS.md §7, PRODUCT_SPEC.md §8.4): parked tasks grouped by
// project in the sidebar's order, loose ones last, every row offering Today ·
// Pick a date · Back to active · Drop, each undoable; and what the rollover
// filed on its own pinned at the top as "Moved here automatically", announced
// once, with Bring them all back (one undo).
//
// The auto-filed task is seeded the way the rollover job files one (migration
// 20261006001100, run_rollover step 4): as postgres, with the job's session
// flag on so the move is not a touch, state someday, no date, carry 0 and a
// server-owned auto_filed_at. Bring them all back brings every auto-filed task
// back, so any already filed are stood aside for the length of that test
// (their stamp cleared) and put back exactly as found, as are the settings'
// announcement columns the test writes.
import { expect, test } from "./fixtures";
import { devAccount, isoPlus, waitForRow, withDb, type DevAccount } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";

let me: DevAccount;

test.describe("grouped by project, with the row actions", () => {
  const toToday = uniqueTitle("someday today");
  const toDate = uniqueTitle("someday pick");
  const toActive = uniqueTitle("someday active");
  const toDrop = uniqueTitle("someday drop");
  let project: { id: string; name: string; area: string | null } | null = null;

  test.beforeAll(async () => {
    await withDb(async (c) => {
      me = await devAccount(c, DEV_USER.email);
      project =
        (
          await c.query<{ id: string; name: string; area: string | null }>(
            `select p.id, p.name, a.name as area from public.projects p left join public.areas a on a.id = p.area_id and a.deleted_at is null
              where p.space_id = $1 and p.deleted_at is null and p.state = 'active' and p.name is not null
              order by a.sort_key nulls last, p.sort_key limit 1`,
            [me.sid],
          )
        ).rows[0] ?? null;
      // Two in the project, two loose.
      for (const [title, projectId] of [
        [toToday, project?.id ?? null],
        [toActive, project?.id ?? null],
        [toDate, null],
        [toDrop, null],
      ] as const) {
        await c.query(
          `insert into public.tasks (id, space_id, project_id, title, state, priority, estimate_min, sort_key)
           values (gen_random_uuid(), $1, $2, $3, 'someday', 0, 30, 'y0000000000000000000000041')`,
          [me.sid, projectId, title],
        );
      }
    });
  });

  test("tasks are grouped by project with loose ones last; Today, Pick a date, Back to active and Drop each work and undo", async ({ page }) => {
    test.skip(project === null, "the dev account has no project to group under");
    await openApp(page, "/someday");
    const inProject = page.getByRole("region", { name: project!.name, exact: true });
    const loose = page.getByRole("region", { name: "Not in a project" });
    const rowIn = (where: typeof loose, title: string) => where.getByRole("listitem").filter({ hasText: title });
    await expect(rowIn(inProject, toToday)).toBeVisible();
    await expect(rowIn(inProject, toActive)).toBeVisible();
    await expect(rowIn(loose, toDate)).toBeVisible();
    await expect(rowIn(loose, toDrop)).toBeVisible();
    // The project's area is named beside it.
    if (project!.area) await expect(inProject.getByText(new RegExp(`· ${project!.area.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`))).toBeVisible();
    // Loose tasks come last, after every project's group.
    const groups = await page.locator("main section[aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(groups.at(-1)).toBe("Not in a project");
    expect(groups.indexOf(project!.name)).toBeLessThan(groups.indexOf("Not in a project"));

    const TASK = "select id from public.tasks where title = $1";
    const undo = async (title: string, where: typeof loose) => {
      await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
      await expect(rowIn(where, title)).toBeVisible();
      expect(await waitForRow(`${TASK} and state = 'someday' and do_date is null`, [title])).not.toBeNull();
    };
    const act = async (where: typeof loose, title: string, action: string) => {
      const row = rowIn(where, title);
      await row.hover();
      await row.getByRole("button", { name: action, exact: true }).click();
    };

    // Today: active, dated today.
    await act(inProject, toToday, "Today");
    await expect(rowIn(inProject, toToday)).toHaveCount(0);
    expect(await waitForRow(`${TASK} and state = 'active' and do_date = $2::date`, [toToday, me.today])).not.toBeNull();
    await undo(toToday, inProject);

    // Pick a date: a short sheet with the date field; choosing a day moves the task there.
    const picked = isoPlus(me.today, 3);
    await act(loose, toDate, "Pick a date");
    const sheet = page.getByRole("dialog", { name: "Pick a date" });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel(`Pick a date for ${toDate}`).fill(picked);
    await expect(sheet).toHaveCount(0);
    await expect(rowIn(loose, toDate)).toHaveCount(0);
    expect(await waitForRow(`${TASK} and state = 'active' and do_date = $2::date`, [toDate, picked])).not.toBeNull();
    await undo(toDate, loose);

    // Back to active: active with no date (its project, or Upcoming's "Not yet planned").
    await act(inProject, toActive, "Back to active");
    await expect(rowIn(inProject, toActive)).toHaveCount(0);
    expect(await waitForRow(`${TASK} and state = 'active' and do_date is null`, [toActive])).not.toBeNull();
    await undo(toActive, inProject);

    // Drop.
    await act(loose, toDrop, "Drop");
    await expect(rowIn(loose, toDrop)).toHaveCount(0);
    expect(await waitForRow(`${TASK} and state = 'dropped'`, [toDrop])).not.toBeNull();
    await undo(toDrop, loose);
  });
});

test.describe("the auto-filed group", () => {
  const filed = uniqueTitle("auto filed");
  let stoodAside: { id: string; auto_filed_at: string; updated_at: string }[] = [];
  let settings: { auto_filed_seen_at: string | null; updated_at: string } | null = null;

  test.beforeAll(async () => {
    await withDb(async (c) => {
      me = await devAccount(c, DEV_USER.email);
      settings = (await c.query("select auto_filed_seen_at::text, updated_at::text from public.user_settings where user_id = $1", [me.uid])).rows[0];
      await c.query("begin");
      try {
        // Every auto-filed task already there (the account's own, or an earlier run's not yet torn down) leaves the
        // group for now: a raw write (no triggers), so nothing else on them moves.
        await c.query("set local session_replication_role = replica");
        stoodAside = (
          await c.query(
            `select id, auto_filed_at::text, updated_at::text from public.tasks
              where space_id = $1 and deleted_at is null and auto_filed_at is not null`,
            [me.sid],
          )
        ).rows;
        if (stoodAside.length > 0) await c.query("update public.tasks set auto_filed_at = null where id = any($1::uuid[])", [stoodAside.map((r) => r.id)]);
        await c.query("commit");
      } catch (e) {
        await c.query("rollback");
        throw e;
      }

      // A task nobody has touched for forty days, then filed the way run_rollover's step 4 files it.
      const id = (
        await c.query<{ id: string }>(
          `insert into public.tasks (id, space_id, title, state, priority, do_date, estimate_min, sort_key, last_touched_at, created_at)
           values (gen_random_uuid(), $1, $2, 'active', 0, $3::date, 30, 'y0000000000000000000000042', now() - interval '40 days', now() - interval '40 days')
           returning id`,
          [me.sid, filed, isoPlus(me.today, -40)],
        )
      ).rows[0].id;
      await c.query("begin");
      try {
        await c.query("select set_config('sparehour.rollover', 'on', true)");
        await c.query(
          `update public.tasks set state = 'someday', do_date = null, do_time = null, carry_count = 0, auto_filed_at = now(), updated_at = now()
            where id = $1`,
          [id],
        );
        await c.query("commit");
      } catch (e) {
        await c.query("rollback");
        throw e;
      }
    });
  });

  test.afterAll(async () => {
    await withDb(async (c) => {
      await c.query("begin");
      try {
        // Exactly as found: the stamps and the settings row, without the triggers moving updated_at again.
        await c.query("set local session_replication_role = replica");
        if (stoodAside.length > 0) {
          await c.query(
            "update public.tasks t set auto_filed_at = v.af, updated_at = v.ua from unnest($1::uuid[], $2::timestamptz[], $3::timestamptz[]) as v(id, af, ua) where t.id = v.id",
            [stoodAside.map((r) => r.id), stoodAside.map((r) => r.auto_filed_at), stoodAside.map((r) => r.updated_at)],
          );
        }
        if (settings) await c.query("update public.user_settings set auto_filed_seen_at = $2, updated_at = $3 where user_id = $1", [me.uid, settings.auto_filed_seen_at, settings.updated_at]);
        await c.query("commit");
      } catch (e) {
        await c.query("rollback");
        throw e;
      }
    });
  });

  test("the auto-filed task is pinned and announced once; Bring them all back restores it, and ⌘Z parks it again", async ({ page }) => {
    await openApp(page, "/someday");
    const group = page.getByRole("region", { name: "Moved here automatically" });
    await expect(group.getByRole("listitem").filter({ hasText: filed })).toBeVisible();
    await expect(group).toContainText(/You hadn.t touched these in \d+ days\./);
    // Pinned above every other group.
    const groups = await page.locator("main section[aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(groups[0]).toBe("Moved here automatically");

    // The batch is announced once in the header; dismissing it is remembered on the settings row.
    const announcement = page.getByRole("status").filter({ hasText: /^1 task moved to Someday while you weren.t looking/ });
    await expect(announcement).toBeVisible();
    await announcement.getByRole("button", { name: "Dismiss" }).click();
    await expect(announcement).toHaveCount(0);
    expect(
      await waitForRow("select s.id from public.user_settings s, public.tasks t where s.user_id = $1 and t.title = $2 and s.auto_filed_seen_at >= t.auto_filed_at", [me.uid, filed]),
    ).not.toBeNull();

    await group.getByRole("button", { name: "Bring them all back" }).click();
    await expect(group).toHaveCount(0);
    // Back to active, and the server's stamp is gone with the move.
    expect(await waitForRow("select id from public.tasks where title = $1 and state = 'active' and auto_filed_at is null and do_date is null", [filed])).not.toBeNull();
    await expect(page.getByRole("listitem").filter({ hasText: filed })).toHaveCount(0);

    // One undo for the batch: parked again, now as an ordinary Someday task (a person can clear the stamp, never set it).
    await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
    expect(await waitForRow("select id from public.tasks where title = $1 and state = 'someday' and auto_filed_at is null and do_date is null", [filed])).not.toBeNull();
    await expect(page.getByRole("region", { name: "Not in a project" }).getByRole("listitem").filter({ hasText: filed })).toBeVisible();
    await expect(page.getByRole("region", { name: "Moved here automatically" })).toHaveCount(0);
  });
});
