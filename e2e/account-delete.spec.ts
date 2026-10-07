// Deleting an account (SYSTEM_DESIGN.md §9.6; ruled 2026-10-06), its server
// half: POST /api/account/delete wants a JSON body that says "delete", marks
// the account for thirty days and ends its sessions; the account then syncs
// nothing and every app page leads to /account/deleted, which names the day
// and offers Restore; Restore brings the account back and opens Today.
//
// The same through Settings › Account: Delete account's typed confirmation,
// then this device clears itself and lands on the page that names the day.
//
// Never the dev account: each test makes a throwaway local account the way
// supabase/seed.sql makes the dev user (the same password), signs in as it in
// a context of its own, and afterAll removes them and every row they own.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { waitForRow, withDb } from "./db";
import { DEV_USER, openApp } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

const email = `e2e-delete-${Date.now().toString(36)}@sparehour.local`;
let uid = "";
/** Every throwaway account made here, for afterAll. */
const made: string[] = [];

/** A throwaway local account with an email identity, as the seed makes the dev user; its id. */
async function makeAccount(address: string): Promise<string> {
  return withDb(async (c) => {
    // GoTrue scans the token columns into non-null strings: none of them may be NULL (see the seed).
    const id = (
      await c.query<{ id: string }>(
        `insert into auth.users (
           id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
           confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
           phone_change, phone_change_token, reauthentication_token)
         values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           $1, extensions.crypt($2, extensions.gen_salt('bf')), now(),
           '{"provider":"email","providers":["email"]}', '{"full_name":"E2E Delete","timezone":"Europe/London"}', now(), now(),
           '', '', '', '', '', '', '', '')
         returning id`,
        [address, DEV_USER.password],
      )
    ).rows[0].id;
    made.push(id);
    await c.query(
      `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), $1::uuid, $2::text, jsonb_build_object('sub', $2::text, 'email', $3::text), 'email', now(), now(), now())`,
      [id, id, address],
    );
    return id;
  });
}

test.beforeAll(async () => {
  uid = await makeAccount(email);
});

test.afterAll(async () => {
  if (made.length === 0) return;
  await withDb(async (c) => {
    // The ledgers that name a user without a key first, as the nightly purge does; the auth user takes the rest with it.
    await c.query("delete from private.mutations where user_id = any($1::uuid[])", [made]);
    await c.query("delete from private.rollover_runs where user_id = any($1::uuid[])", [made]);
    await c.query("delete from auth.users where id = any($1::uuid[])", [made]);
  });
});

async function signIn(page: Page, address = email): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Use a password" }).click();
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password").fill(DEV_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** "Thursday 5 November 2026", as the page names the day (features/account/deletion deletionDay). */
const longDay = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));

test("a deleted account is held for thirty days behind a page that offers Restore, and Restore brings it back", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/today/, { timeout: 30_000 });
  const MARKED = "select deleted_at from public.users where id = $1 and deleted_at is not null";

  // Only a JSON body that says so: a posted form, or a body without the word, changes nothing.
  expect((await page.request.post("/api/account/delete", { form: { confirm: "delete" } })).status()).toBe(415);
  expect((await page.request.post("/api/account/delete", { data: { confirm: "yes" } })).status()).toBe(400);
  expect(await waitForRow(MARKED, [uid], 1_000)).toBeNull();

  const res = await page.request.post("/api/account/delete", { data: { confirm: "delete" } });
  expect(res.status()).toBe(200);
  const { delete_after: after } = (await res.json()) as { delete_after: string };
  const marked = await waitForRow<{ deleted_at: Date }>(MARKED, [uid]);
  expect(marked).not.toBeNull();
  // Thirty days from the request, in the database and in the auth user's app metadata the proxy reads.
  expect(new Date(after).getTime() - marked!.deleted_at.getTime()).toBe(30 * 86_400_000);
  expect(await waitForRow("select 1 from auth.users where id = $1 and (raw_app_meta_data ->> 'delete_after')::timestamptz = $2::timestamptz", [uid, after])).not.toBeNull();

  // Every session ended: the app is behind sign-in again.
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);

  // Signing back in within the thirty days lands on the page that names the day, and nowhere else.
  await signIn(page);
  await expect(page).toHaveURL(/\/account\/deleted$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Your account will be deleted on ${longDay(after)}.`);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/account\/deleted$/);
  // It syncs nothing while it waits.
  expect((await page.request.get("/api/sync/token")).status()).toBe(403);

  await page.getByRole("button", { name: "Restore my account" }).click();
  await expect(page).toHaveURL(/\/today/, { timeout: 30_000 });
  expect(await waitForRow("select 1 from public.users where id = $1 and deleted_at is null", [uid])).not.toBeNull();
  expect(await waitForRow("select 1 from auth.users where id = $1 and not (raw_app_meta_data ? 'delete_after')", [uid])).not.toBeNull();
  expect((await page.request.get("/api/sync/token")).status()).toBe(200);
});

test("Delete account in Settings: the typed word, then this device leaves and lands on the page that names the day", async ({ page }) => {
  test.setTimeout(180_000);
  const address = `e2e-delete-ui-${Date.now().toString(36)}@sparehour.local`;
  const id = await makeAccount(address);
  await signIn(page, address);
  await expect(page).toHaveURL(/\/today/, { timeout: 30_000 });
  await openApp(page, "/settings#account");

  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Delete your account?" });
  await expect(sheet.getByText(/^Every task, step, project, area and tag/)).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Export your data first" })).toBeVisible();
  const go = sheet.getByRole("button", { name: "Delete account", exact: true });
  await expect(go).toBeDisabled();
  await sheet.getByLabel(/to confirm/).fill("delete");
  await go.click();

  await expect(page).toHaveURL(/\/account\/deleted\?on=/, { timeout: 30_000 });
  const marked = await waitForRow<{ after: string }>("select raw_app_meta_data ->> 'delete_after' as after from auth.users where id = $1 and raw_app_meta_data ? 'delete_after'", [id]);
  expect(marked).not.toBeNull();
  expect(await waitForRow("select 1 from public.users where id = $1 and deleted_at is not null", [id])).not.toBeNull();
  // Signed out here too, so the page names the day from its address and offers Sign in.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Your account will be deleted on ${longDay(marked!.after)}.`);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);
});
