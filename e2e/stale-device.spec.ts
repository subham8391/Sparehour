// A device that still holds one account's copy when another account signs in on it (DECISIONS.md, amendment
// 2026-11-21): the session ended without a sign-out here (revoked elsewhere, expired, or the account removed on the
// server), so the local database was never cleared. The new account must never be shown the last account's rows.
// It starts from its own data, with its whole first run ahead: the hours, then the calendar (a stale copy with a
// calendar connection in it used to make the first run skip that step), then the brain dump.
//
// The dev account's copy is put on the device first, with a task of this spec's own to look for. Its cookies are
// then dropped (the local database stays), and a new person signs in with an emailed code. The task is removed
// afterwards; the new account is the spec's own.
import { expect, test } from "./fixtures";
import { devAccount, removeOwn, waitForRow, withDb, type DevAccount } from "./db";
import { DEV_USER, openApp, uniqueTitle } from "./helpers";
import { seedTask } from "./timeline-helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function waitForCode(email: string, timeoutMs = 20_000): Promise<string> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const list = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages } = list.ok ? ((await list.json()) as { messages: { ID: string }[] }) : { messages: [] };
    const id = messages[0]?.ID;
    if (id) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Text: string };
      const code = /\b(\d{6})\b/.exec(message.Text)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no sign-in code for ${email} reached Mailpit within ${timeoutMs} ms`);
}

let me: DevAccount;
const mine: string[] = [];

test.beforeAll(async () => {
  await withDb(async (c) => {
    me = await devAccount(c, DEV_USER.email);
  });
});

test.afterAll(async () => {
  await withDb((c) => removeOwn(c, mine));
});

test("another account signing in on a device that still holds the last one's copy is never shown it, and starts at its own first run", async ({ page, context }) => {
  const theirs = uniqueTitle("stale copy");
  mine.push(theirs);
  await withDb((c) => seedTask(c, me, theirs, { estimate: 30 }));
  await page.route("**/api/calendar/config", (route) => route.fulfill({ json: { google: true } }));

  // The dev account's copy is on the device.
  await openApp(page, "/today");
  await expect(page.getByRole("row").filter({ hasText: theirs })).toBeVisible();

  // Its session goes without a sign-out: the cookies are gone, the local database stays.
  await context.clearCookies();
  const email = `e2e-stale-${Date.now().toString(36)}@sparehour.local`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText("We sent a code to")).toBeVisible();
  await page.getByLabel("Code").fill(await waitForCode(email));

  // From the moment the new person is in, nothing of the last account is drawn, on any screen they pass through.
  let seen = false;
  const watch = setInterval(() => {
    void page
      .getByText(theirs)
      .count()
      .then((n) => {
        if (n > 0) seen = true;
      })
      .catch(() => undefined);
  }, 100);
  try {
    await page.getByRole("button", { name: "Sign in" }).click();
    const user = await waitForRow<{ id: string }>("select id from public.users where email = $1", [email]);
    expect(user?.id).toBeTruthy();

    // Their own first run, from its first step: the hours, the calendar, then the brain dump.
    await expect(page).toHaveURL(/\/welcome/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "When do you work?" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "That’s right" }).click();
    await expect(page.getByRole("heading", { name: "Connect your calendar." })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page.getByRole("heading", { name: "What's on your plate today?" })).toBeVisible();
    await page.getByRole("button", { name: "I’ll add things later" }).click();
    await expect(page).toHaveURL(/\/today/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
    // The end of the first run was written to the new account's own settings, not to a row left by the last one.
    expect(await waitForRow("select 1 from public.user_settings where user_id = $1 and onboarded_at is not null", [user?.id])).not.toBeNull();
  } finally {
    clearInterval(watch);
  }
  expect(seen).toBe(false);
  await expect(page.getByText(theirs)).toHaveCount(0);
});
