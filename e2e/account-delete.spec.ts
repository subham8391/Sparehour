// Deleting an account (SYSTEM_DESIGN.md §9.6; ruled 2026-10-06), its server
// half: POST /api/account/delete wants a JSON body that says "delete", marks
// the account for thirty days and ends its sessions; the account then syncs
// nothing and every app page leads to /account/deleted, which names the day
// and offers Restore; Restore brings the account back and opens Today.
//
// Never the dev account: the test makes a throwaway local account the way
// supabase/seed.sql makes the dev user (the same password), signs in as it in
// a context of its own, and afterAll removes it and every row it owns.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { waitForRow, withDb } from "./db";
import { DEV_USER } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

const email = `e2e-delete-${Date.now().toString(36)}@sparehour.local`;
let uid = "";

test.beforeAll(async () => {
  await withDb(async (c) => {
    // GoTrue scans the token columns into non-null strings: none of them may be NULL (see the seed).
    uid = (
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
        [email, DEV_USER.password],
      )
    ).rows[0].id;
    await c.query(
      `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), $1::uuid, $2::text, jsonb_build_object('sub', $2::text, 'email', $3::text), 'email', now(), now(), now())`,
      [uid, uid, email],
    );
  });
});

test.afterAll(async () => {
  if (!uid) return;
  await withDb(async (c) => {
    // The ledgers that name a user without a key first, as the nightly purge does; the auth user takes the rest with it.
    await c.query("delete from private.mutations where user_id = $1", [uid]);
    await c.query("delete from private.rollover_runs where user_id = $1", [uid]);
    await c.query("delete from auth.users where id = $1", [uid]);
  });
});

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Use a password" }).click();
  await page.getByLabel("Email").fill(email);
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
