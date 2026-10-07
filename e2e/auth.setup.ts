// Signs in once as the seeded dev account and saves the session for the suite.
import { expect, test as setup } from "@playwright/test";
import { withDb } from "./db";
import { DEV_USER } from "./helpers";

setup("sign in as the dev account", async ({ page }) => {
  // The dev account is long past the first run (/welcome): the seed and the migration mark it done, and this
  // makes sure of it on any database, so the gate never sends the suite there. magic-link.spec.ts walks a new account through it.
  await withDb((c) => c.query("update public.user_settings s set onboarded_at = coalesce(s.onboarded_at, now()) from public.users u where u.id = s.user_id and u.email = $1", [DEV_USER.email]));
  await page.goto("/login");
  await page.getByRole("button", { name: "Use a password" }).click();
  await page.getByLabel("Email").fill(DEV_USER.email);
  await page.getByLabel("Password").fill(DEV_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/today/, { timeout: 30_000 });
  await page.context().storageState({ path: "e2e/.auth/user.json" });
  // The dev account always has carried-over tasks, so the morning review sheet would open on every
  // first visit of a new day and sit over whatever a test is doing. Off for the suite; carry-review.spec.ts turns it on for itself.
  await withDb((c) => c.query("update public.user_settings s set carry_review = false from public.users u where u.id = s.user_id and u.email = $1", [DEV_USER.email]));
});
