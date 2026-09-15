// Signs in once as the seeded dev account and saves the session for the suite.
import { expect, test as setup } from "@playwright/test";
import { DEV_USER } from "./helpers";

setup("sign in as the dev account", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Use a password" }).click();
  await page.getByLabel("Email").fill(DEV_USER.email);
  await page.getByLabel("Password").fill(DEV_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/today/, { timeout: 30_000 });
  await page.context().storageState({ path: "e2e/.auth/user.json" });
});
