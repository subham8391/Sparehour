// Sign-in by emailed code (ONBOARDING.md step 1): a person the app has never
// seen asks for a code, reads it from the local mail catcher, and lands on
// Today with a provisioned account. Runs signed out.
import { expect, test } from "./fixtures";
import { waitForRow } from "./db";

test.use({ storageState: { cookies: [], origins: [] } });

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function latestCode(email: string): Promise<string | null> {
  const list = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  if (!list.ok) return null;
  const { messages } = (await list.json()) as { messages: { ID: string }[] };
  const id = messages[0]?.ID;
  if (!id) return null;
  const message = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Text: string };
  return /\b(\d{6})\b/.exec(message.Text)?.[1] ?? null;
}

async function waitForCode(email: string, timeoutMs = 20_000): Promise<string> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const code = await latestCode(email);
    if (code) return code;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no sign-in code for ${email} reached Mailpit within ${timeoutMs} ms`);
}

test("a new person signs in with the emailed code and lands on Today with an account", async ({ page }) => {
  const email = `e2e-magic-${Date.now().toString(36)}@sparehour.local`;
  await page.goto("/login?next=%2Finbox");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText("We sent a code to")).toBeVisible();

  await page.getByLabel("Code").fill(await waitForCode(email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/inbox/, { timeout: 30_000 });

  // Provisioned by the trigger: a users row with a personal space and settings.
  const user = await waitForRow<{ id: string; personal_space_id: string | null }>("select id, personal_space_id from public.users where email = $1", [email]);
  expect(user?.personal_space_id).toBeTruthy();
});
