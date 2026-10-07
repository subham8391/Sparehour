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

test("a new person signs in with the emailed code, confirms their hours, empties their head into today, and lands on Today", async ({ page }) => {
  const email = `e2e-magic-${Date.now().toString(36)}@sparehour.local`;
  await page.goto("/login?next=%2Finbox");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText("We sent a code to")).toBeVisible();

  await page.getByLabel("Code").fill(await waitForCode(email));
  await page.getByRole("button", { name: "Sign in" }).click();

  // Provisioned by the trigger: a users row with a personal space and settings.
  const user = await waitForRow<{ id: string; personal_space_id: string | null }>("select id, personal_space_id from public.users where email = $1", [email]);
  expect(user?.personal_space_id).toBeTruthy();

  // The first run comes before anything else, once the account is on the device (ONBOARDING.md 1b): Mon–Fri
  // 09:00–18:00 is already chosen, and one tap accepts it. No sidebar, no tab bar.
  await expect(page).toHaveURL(/\/welcome/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "When do you work?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Monday" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Saturday" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await page.getByRole("button", { name: "That’s right" }).click();

  // Step 3, the brain dump; a reload comes back to it rather than to the hours.
  await expect(page.getByRole("heading", { name: "What's on your plate today?" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "What's on your plate today?" })).toBeVisible({ timeout: 30_000 });
  const box = page.getByRole("textbox", { name: "Task" });
  await box.fill("E2E Call the plumber ~30m");
  await box.press("Enter");
  await box.fill("E2E Send the invoice tomorrow");
  await box.press("Enter");
  const plate = page.getByRole("list", { name: "On your plate" });
  await expect(plate.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("Tomorrow — I'll keep it for then.")).toBeVisible();
  await page.getByRole("button", { name: "Next — 2 things" }).click();

  await expect(page).toHaveURL(/\/today/, { timeout: 30_000 });
  await expect(page.getByRole("listitem").filter({ hasText: "E2E Call the plumber" })).toBeVisible();

  // The account is done with the first run; the dateless line is on today (it shows in Today above), active, and
  // the dated one kept its day, the next.
  expect(await waitForRow("select 1 from public.user_settings where user_id = $1 and onboarded_at is not null", [user?.id])).not.toBeNull();
  const days = await waitForRow<{ state: string; apart: number }>(
    `select p.state, i.do_date - p.do_date as apart from public.tasks p join public.tasks i on i.space_id = p.space_id
      where p.space_id = $1 and p.title = 'E2E Call the plumber' and i.title = 'E2E Send the invoice'`,
    [user?.personal_space_id],
  );
  expect(days).toEqual({ state: "active", apart: 1 });
});
