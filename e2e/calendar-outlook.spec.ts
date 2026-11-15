// Settings → Calendar with Outlook (SCREENS.md §18; DECISIONS.md, amendment 2026-11-15). The local stack has no
// Microsoft app registration, so what the server says it can connect is stubbed where Outlook should be offered
// (as first-run-phone.spec.ts stubs it for Google), and Microsoft's consent is not ours to drive: the test stops at
// the navigation to the start route. Where nothing is stubbed, the real server has no Microsoft client, and Outlook
// must not be there at all: no button, no word of it, no route.
import { expect, test } from "./fixtures";
import { openApp } from "./helpers";

const START = "/api/calendar/microsoft/start";

test("where the server can connect Outlook, Settings offers it beside Google, and it leaves for the Microsoft start route", async ({ page }) => {
  await page.route("**/api/calendar/config", (route) => route.fulfill({ json: { google: true, microsoft: true } }));
  // The route itself is a 404 here (no client id), and Microsoft's sign-in is not part of this test: answer in its place.
  await page.route(`**${START}**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Microsoft sign-in, stubbed</title>" }));
  await openApp(page, "/settings#calendar");

  const calendar = page.getByRole("region", { name: "Calendar" });
  // The seeded Google connection is still listed as it was.
  await expect(calendar.getByText("dev@sparehour.local").first()).toBeVisible();
  const outlook = calendar.getByRole("button", { name: "Connect Outlook" });
  await expect(outlook).toBeEnabled();
  await expect(calendar.getByRole("button", { name: "Add another Google account" })).toBeEnabled();

  // A full navigation to the start route, coming back to Settings afterwards.
  const leaving = page.waitForRequest((request) => new URL(request.url()).pathname === START);
  await outlook.click();
  const request = await leaving;
  expect(request.isNavigationRequest()).toBe(true);
  expect(new URL(request.url()).search).toBe("?next=%2Fsettings");
});

test("on a server without a Microsoft client, Outlook is not there: no button, no word of it, and no route", async ({ page }) => {
  // Nothing stubbed: the local stack's own answer.
  const answered = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/calendar/config", { timeout: 60_000 });
  await openApp(page, "/settings#calendar");
  expect(await (await answered).json()).toMatchObject({ microsoft: false });

  const calendar = page.getByRole("region", { name: "Calendar" });
  await expect(calendar.getByText("dev@sparehour.local").first()).toBeVisible();
  await expect(calendar.getByRole("button", { name: "Sync now" })).toBeVisible();
  await expect(calendar.getByRole("button", { name: /Outlook/ })).toHaveCount(0);
  await expect(calendar.getByText(/Outlook/)).toHaveCount(0);

  // Signed in, and still nothing answers at either address.
  expect((await page.request.get(`${START}?next=%2Fsettings`, { maxRedirects: 0 })).status()).toBe(404);
  expect((await page.request.get("/api/calendar/microsoft/callback?code=x&state=y", { maxRedirects: 0 })).status()).toBe(404);
});

test.describe("at 360 px", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test("Connect Outlook is a 44 px target and nothing scrolls sideways", async ({ page }) => {
    // Outlook alone: Google's button, which would lead nowhere on this server, is left out.
    await page.route("**/api/calendar/config", (route) => route.fulfill({ json: { google: false, microsoft: true } }));
    await openApp(page, "/settings#calendar");
    const outlook = page.getByRole("button", { name: "Connect Outlook" });
    await expect(outlook).toBeVisible();
    const box = await outlook.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    await expect(page.getByRole("button", { name: /Google account|Connect Google Calendar/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});
