import { describe, expect, it } from "vitest";
import { LOCAL_DEV_SYNC_SECRET, SYNC_TOKEN_AUDIENCE, SYNC_TOKEN_KID, secretUsable, signSyncToken, verifySyncToken } from "./token";

const secret = "sparehour-local-sync-token-secret-0123456789abcdef";
const now = 1_789_400_000;

describe("sync token", () => {
  it("carries the user, the audience, five minutes and the build, and verifies", () => {
    const { token, expiresAt } = signSyncToken({ userId: "u1", secret, now, appVersion: "abc123" });
    expect(expiresAt).toBe(now + 300);
    const [header] = token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT", kid: SYNC_TOKEN_KID });
    expect(verifySyncToken(token, secret, now + 10)).toEqual({ sub: "u1", aud: SYNC_TOKEN_AUDIENCE, iat: now, exp: now + 300, app_ver: "abc123" });
  });

  it("is refused once expired, with the wrong secret, or when tampered with", () => {
    const { token } = signSyncToken({ userId: "u1", secret, now });
    expect(verifySyncToken(token, secret, now + 301)).toBeNull();
    expect(verifySyncToken(token, "another-secret-that-is-long-enough-to-pass", now)).toBeNull();
    const [h, p, s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "u2", aud: SYNC_TOKEN_AUDIENCE, iat: now, exp: now + 300 })).toString("base64url");
    expect(verifySyncToken(`${h}.${forged}.${s}`, secret, now)).toBeNull();
    expect(verifySyncToken(`${h}.${p}`, secret, now)).toBeNull();
    expect(verifySyncToken("", secret, now)).toBeNull();
  });

  it("never signs with a short secret", () => {
    expect(() => signSyncToken({ userId: "u1", secret: "short", now })).toThrow(/32 characters/);
  });

  it("the shared development secret is refused in production unless CI says otherwise", () => {
    expect(secretUsable(LOCAL_DEV_SYNC_SECRET, { NODE_ENV: "development" })).toBe(true);
    expect(secretUsable(LOCAL_DEV_SYNC_SECRET, { NODE_ENV: "production" })).toBe(false);
    expect(secretUsable(LOCAL_DEV_SYNC_SECRET, { NODE_ENV: "production", ALLOW_DEV_SECRETS: "1" })).toBe(true);
    expect(secretUsable("a-real-secret-that-is-at-least-32-chars-long", { NODE_ENV: "production" })).toBe(true);
    expect(secretUsable("short", { NODE_ENV: "production" })).toBe(false);
  });
});
