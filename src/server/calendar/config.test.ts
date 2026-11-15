// Which calendars this server can connect, from its environment (SYSTEM_DESIGN.md §9.4). Outlook is there only with
// both of its variables and the token key; without them it is absent, and Google is not affected either way.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calendarConfigured, googleConfigured, googleOAuth, microsoftConfigured, microsoftOAuth } from "./config";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("calendar configuration", () => {
  beforeEach(() => {
    for (const name of ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "MICROSOFT_OAUTH_CLIENT_ID", "MICROSOFT_OAUTH_CLIENT_SECRET", "CALENDAR_TOKEN_KEY"]) vi.stubEnv(name, "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://sparehour-dev.vercel.app/");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("Outlook needs its client id, its secret and the token key; its callback is on the app's own address", () => {
    expect(microsoftOAuth()).toBeNull();
    expect(microsoftConfigured()).toBe(false);
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_ID", "00001111-aaaa-2222-bbbb-3333cccc4444");
    expect(microsoftOAuth()).toBeNull(); // an id without a secret is not a client
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_SECRET", "s3cret");
    expect(microsoftOAuth()).toEqual({ clientId: "00001111-aaaa-2222-bbbb-3333cccc4444", clientSecret: "s3cret", redirectUri: "https://sparehour-dev.vercel.app/api/calendar/microsoft/callback" });
    expect(microsoftConfigured()).toBe(false); // nothing to seal the tokens with yet
    vi.stubEnv("CALENDAR_TOKEN_KEY", KEY);
    expect(microsoftConfigured()).toBe(true);
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_ID", "");
    expect(microsoftConfigured()).toBe(false);
  });

  it("each provider stands on its own variables, and the server can connect a calendar when either is there", () => {
    vi.stubEnv("CALENDAR_TOKEN_KEY", KEY);
    expect(calendarConfigured()).toBe(false);
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_ID", "mid");
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_SECRET", "msecret");
    expect([googleConfigured(), microsoftConfigured(), calendarConfigured()]).toEqual([false, true, true]);
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "gid");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "gsecret");
    expect([googleConfigured(), microsoftConfigured(), calendarConfigured()]).toEqual([true, true, true]);
    expect(googleOAuth()?.redirectUri).toBe("https://sparehour-dev.vercel.app/api/calendar/google/callback");
    vi.stubEnv("MICROSOFT_OAUTH_CLIENT_SECRET", "");
    expect([googleConfigured(), microsoftConfigured(), calendarConfigured()]).toEqual([true, false, true]);
  });
});
