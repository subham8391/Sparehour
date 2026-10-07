// The first run on a phone (ONBOARDING.md "Phone: one step per screen"; M1 gaps first-run-working-hours and
// first-run-brain-dump, "360 px"): at 360 px on a touch phone, 1b and the brain dump are consecutive screens with
// no tab bar, the step's buttons run full width and hold the bottom edge, every target is 44 px, nothing scrolls
// sideways, and a line typed but not entered is saved when Next is tapped.
//
// Never the dev account: a throwaway local account made the way supabase/seed.sql makes the dev user (the same
// password), whose first run is still ahead; afterAll removes it and every row it owns (and global-teardown.ts
// sweeps any left by an interrupted run, by its e2e-magic- address).
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { waitForRow, withDb } from "./db";
import { DEV_USER } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 360, height: 780 } });

const email = `e2e-magic-phone-${Date.now().toString(36)}@sparehour.local`;
let uid = "";
let spaceId = "";

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
           '{"provider":"email","providers":["email"]}', '{"full_name":"E2E First Run"}', now(), now(),
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
    spaceId = (await c.query<{ personal_space_id: string }>("select personal_space_id from public.users where id = $1", [uid])).rows[0].personal_space_id;
  });
});

test.afterAll(async () => {
  if (!uid) return;
  await withDb(async (c) => {
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

/** Full width inside the 20 px gutters, at least 44 px tall, its bottom edge just above the screen's own. */
async function heldAtTheBottom(button: Locator, viewport: { width: number; height: number }): Promise<void> {
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 41);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  expect(box!.y + box!.height).toBeGreaterThan(viewport.height - 32);
}

async function noSidewaysScroll(page: Page, width: number): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test("a new account's first run at 360 px: one step per screen, full-width buttons at the bottom, 44 px targets", async ({ page }) => {
  const viewport = page.viewportSize()!;
  await signIn(page);
  await expect(page).toHaveURL(/\/welcome/, { timeout: 30_000 });

  // 1b on its own: no tab bar, nothing of the brain dump yet.
  await expect(page.getByRole("heading", { name: "When do you work?" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "What's on your plate today?" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add a task" })).toHaveCount(0);
  const pills = await page.getByRole("group", { name: "Working days" }).getByRole("button").all();
  expect(pills).toHaveLength(7);
  for (const pill of pills) {
    const box = await pill.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(43.5);
  }
  const zoneChange = await page.getByRole("button", { name: "Change" }).boundingBox();
  expect(zoneChange!.height).toBeGreaterThanOrEqual(44);
  await heldAtTheBottom(page.getByRole("button", { name: "That’s right" }), viewport);
  await noSidewaysScroll(page, viewport.width);
  await page.getByRole("button", { name: "That’s right" }).click();

  // The brain dump on the next screen.
  await expect(page.getByRole("heading", { name: "What's on your plate today?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "When do you work?" })).toHaveCount(0);
  const box = page.getByRole("textbox", { name: "Task" });
  await box.fill("E2E Phone first run ~15m");
  await box.press("Enter");
  await expect(page.getByRole("list", { name: "On your plate" }).getByRole("listitem")).toHaveCount(1);
  const add = await page.getByRole("button", { name: "Add", exact: true }).boundingBox();
  expect(add!.height).toBeGreaterThanOrEqual(44);
  await heldAtTheBottom(page.getByRole("button", { name: "Next — 1 thing" }), viewport);
  await noSidewaysScroll(page, viewport.width);

  // Typed, no Enter, then Next: the line is saved, not dropped.
  await box.fill("E2E Phone typed then Next");
  await page.getByRole("button", { name: "Next — 1 thing" }).click();
  await expect(page).toHaveURL(/\/today/, { timeout: 30_000 });
  await expect(page.getByRole("listitem").filter({ hasText: "E2E Phone typed then Next" })).toBeVisible();
  expect(await waitForRow("select 1 from public.tasks where space_id = $1 and title = 'E2E Phone typed then Next' and state = 'active'", [spaceId])).not.toBeNull();
  expect(await waitForRow("select 1 from public.user_settings where user_id = $1 and onboarded_at is not null", [uid])).not.toBeNull();
});
