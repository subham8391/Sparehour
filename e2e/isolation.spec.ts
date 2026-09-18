// Data isolation and sign-out (SYSTEM_DESIGN.md §9): a brand-new account sees
// none of the dev account's data, and signing out clears the device.
import { expect, test } from "./fixtures";
import { waitForSync } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function waitForCode(email: string): Promise<string> {
  const until = Date.now() + 20_000;
  while (Date.now() < until) {
    const list = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages } = (await list.json()) as { messages: { ID: string }[] };
    if (messages[0]) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string };
      const code = /\b(\d{6})\b/.exec(message.Text)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no sign-in code reached Mailpit");
}

test("a new person sees only their own (empty) world, and sign-out clears the device", async ({ page }) => {
  const email = `e2e-magic-iso-${Date.now().toString(36)}@sparehour.local`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Code").fill(await waitForCode(email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/today/, { timeout: 30_000 });
  await waitForSync(page);

  // The dev account's seeded tasks must not be here.
  await expect(page.getByText("Book dentist")).toHaveCount(0);
  await page.getByRole("link", { name: /^Inbox/ }).click();
  await expect(page.getByText("Inbox is empty.")).toBeVisible();
  await page.getByRole("link", { name: "Logbook" }).click();
  await expect(page.getByText("Nothing finished yet.")).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login\?next=/);
});
