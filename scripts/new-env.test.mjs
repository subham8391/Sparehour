// scripts/new-env.mjs (docs/engineering/DEPLOY.md): a new environment's secrets fit what the app and the services read.
import { describe, expect, it } from "vitest";
import { parseTokenKey } from "@/server/calendar/crypto";
import { SYNC_TOKEN_AUDIENCE, SYNC_TOKEN_KID, signSyncToken, verifySyncToken } from "@/server/sync/token";
import { buildEnvironment, outPathAllowed, render, SYNC_TOKEN_AUDIENCE as SCRIPT_AUDIENCE, SYNC_TOKEN_KID as SCRIPT_KID } from "./new-env.mjs";

const BASE = { name: "dev", url: "https://sparehour-dev.vercel.app", contact: "me@example.com" };
const fakeVapid = () => ({ publicKey: "BPublicKey", privateKey: "privateKey" });
const value = (env, key) => env.vercel.find(([k]) => k === key)?.[1];

describe("buildEnvironment", () => {
  it("makes a sync secret the app can sign with, and a PowerSync key that verifies what it signs", () => {
    const env = buildEnvironment(BASE, { vapid: fakeVapid });
    const secret = value(env, "POWERSYNC_JWT_SECRET");
    expect(secret.length).toBeGreaterThanOrEqual(32);
    expect(env.powersync).toMatchObject({ kid: SYNC_TOKEN_KID, alg: "HS256", audience: SYNC_TOKEN_AUDIENCE });
    expect([SCRIPT_KID, SCRIPT_AUDIENCE]).toEqual([SYNC_TOKEN_KID, SYNC_TOKEN_AUDIENCE]);
    // What the service does with `k`: the key bytes, used as the HMAC secret.
    const serviceSecret = Buffer.from(env.powersync.k, "base64url").toString("utf8");
    const { token } = signSyncToken({ userId: "11111111-1111-4111-8111-111111111111", secret });
    expect(verifySyncToken(token, serviceSecret)?.sub).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("makes a calendar key of 32 bytes, a push subject from the contact, and the app's address without a trailing slash", () => {
    const env = buildEnvironment({ ...BASE, url: "https://sparehour-dev.vercel.app/" }, { vapid: fakeVapid });
    expect(parseTokenKey(value(env, "CALENDAR_TOKEN_KEY"))).toHaveLength(32);
    expect(value(env, "VAPID_SUBJECT")).toBe("mailto:me@example.com");
    expect(value(env, "NEXT_PUBLIC_APP_URL")).toBe("https://sparehour-dev.vercel.app");
    expect(value(env, "NEXT_PUBLIC_VAPID_PUBLIC_KEY")).toBe(value(env, "VAPID_PUBLIC_KEY"));
  });

  it("never sets the local-only variables", () => {
    const env = buildEnvironment(BASE, { vapid: fakeVapid });
    const keys = env.vercel.map(([k]) => k);
    for (const key of ["ALLOW_DEV_SECRETS", "POWERSYNC_INTERNAL_URL", "SKIP_TYPECHECK"]) expect(keys).not.toContain(key);
  });

  it("shares no secret between two runs", () => {
    const a = buildEnvironment(BASE);
    const b = buildEnvironment(BASE);
    const secretKeys = ["POWERSYNC_JWT_SECRET", "CALENDAR_TOKEN_KEY", "PUSH_TICK_SECRET", "VAPID_PRIVATE_KEY", "GOOGLE_WEBHOOK_TOKEN_SECRET"];
    for (const key of secretKeys) expect(value(a, key)).not.toBe(value(b, key));
    expect(a.powersync.rolePassword).not.toBe(b.powersync.rolePassword);
  });

  it("puts dashboard values in the Vercel block when given, and lists them as still to add when not", () => {
    const partial = buildEnvironment({ ...BASE, "supabase-url": "https://abc.supabase.co/" }, { vapid: fakeVapid });
    expect(value(partial, "NEXT_PUBLIC_SUPABASE_URL")).toBe("https://abc.supabase.co");
    expect(partial.missing.map((d) => d.key)).toEqual(["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_POWERSYNC_URL"]);
    const text = render(partial);
    expect(text).toContain("Still to add from the dashboards");
    // A missing value never reaches the paste block as a placeholder Vercel would import literally.
    expect(text).not.toMatch(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=/m);
  });

  it("writes the SQL with the role password and the timers' address and secret", () => {
    const env = buildEnvironment(BASE, { vapid: fakeVapid });
    expect(env.sql).toContain(`alter role powersync_role password '${env.powersync.rolePassword}';`);
    expect(env.sql).toContain(`('app_url', 'https://sparehour-dev.vercel.app'), ('push_tick_secret', '${value(env, "PUSH_TICK_SECRET")}')`);
    expect(env.sql).toContain("on conflict (key) do update set value = excluded.value;");
  });

  it("refuses an address that is not https, a bad name and a missing contact", () => {
    expect(() => buildEnvironment({ ...BASE, url: "http://sparehour-dev.vercel.app" })).toThrow(/https/);
    expect(() => buildEnvironment({ ...BASE, url: "not a url" })).toThrow(/--url/);
    expect(() => buildEnvironment({ ...BASE, name: "Prod!" })).toThrow(/--name/);
    expect(() => buildEnvironment({ ...BASE, contact: "" })).toThrow(/--contact/);
  });
});

describe("outPathAllowed", () => {
  const repo = "/work/Sparehour";
  it("writes outside the repo, or to a git-ignored .env* file in it, and nowhere else", () => {
    expect(outPathAllowed("/work/dev.env", repo)).toBe(true);
    expect(outPathAllowed("/tmp/sparehour-prod.txt", repo)).toBe(true);
    expect(outPathAllowed("/work/Sparehour/.env.dev", repo)).toBe(true);
    expect(outPathAllowed("/work/Sparehour/docs/dev.txt", repo)).toBe(false);
    expect(outPathAllowed("/work/Sparehour/dev.env", repo)).toBe(false);
    expect(outPathAllowed("/work/Sparehour", repo)).toBe(false);
  });
});
