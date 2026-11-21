import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pkceFor, signState, startedInApp, verifyState } from "./state";

describe("OAuth state", () => {
  const secret = "a-secret-that-is-long-enough-for-hmac";
  const state = { userId: "u1", purpose: "read" as const, next: "/settings", nonce: "n1", exp: 2_000_000_000 };

  it("round-trips a signed state", () => {
    expect(verifyState(signState(state, secret), secret, 1_999_999_000)).toEqual(state);
  });

  it("carries the full-access purpose, and nothing it does not know", () => {
    const full = { ...state, purpose: "full" as const };
    expect(verifyState(signState(full, secret), secret, 1_999_999_000)).toEqual(full);
    const odd = signState({ ...state, purpose: "everything" as unknown as "read" }, secret);
    expect(verifyState(odd, secret, 1_999_999_000)).toBeNull();
  });

  it("rejects a bad signature, the wrong secret, an expired state, and rubbish", () => {
    const token = signState(state, secret);
    expect(verifyState(`${token}x`, secret)).toBeNull();
    expect(verifyState(token, "another-secret")).toBeNull();
    expect(verifyState(token, secret, 2_000_000_001)).toBeNull();
    expect(verifyState("not.a.state", secret)).toBeNull();
    expect(verifyState(null, secret)).toBeNull();
    const tampered = `${Buffer.from(JSON.stringify({ ...state, userId: "u2" })).toString("base64url")}.${token.split(".")[1]}`;
    expect(verifyState(tampered, secret)).toBeNull();
  });

  it("carries whose consent it was signed for, under the signature", () => {
    const outlook = { ...state, provider: "microsoft" as const };
    const token = signState(outlook, secret);
    expect(verifyState(token, secret, 1_999_999_000)).toEqual(outlook);
    const relabelled = `${Buffer.from(JSON.stringify({ ...state, provider: "microsoft" })).toString("base64url")}.${signState(state, secret).split(".")[1]}`;
    expect(verifyState(relabelled, secret, 1_999_999_000)).toBeNull();
  });

  it("carries the phone app's mark under the signature, so nobody can add it or take it off", () => {
    const fromApp = { ...state, provider: "google" as const, app: true as const };
    const token = signState(fromApp, secret);
    expect(verifyState(token, secret, 1_999_999_000)).toEqual(fromApp);
    const added = `${Buffer.from(JSON.stringify({ ...state, app: true })).toString("base64url")}.${signState(state, secret).split(".")[1]}`;
    expect(verifyState(added, secret, 1_999_999_000)).toBeNull();
    const removed = `${Buffer.from(JSON.stringify(state)).toString("base64url")}.${token.split(".")[1]}`;
    expect(verifyState(removed, secret, 1_999_999_000)).toBeNull();
  });

  it("startedInApp is true only for a state we signed with the mark, expired or not, and gives nothing else away", () => {
    const fromApp = signState({ ...state, app: true }, secret);
    expect(startedInApp(fromApp, secret)).toBe(true);
    // Expired: still known to be the app's, and still not a state anything acts on.
    const old = signState({ ...state, exp: 1, app: true }, secret);
    expect(startedInApp(old, secret)).toBe(true);
    expect(verifyState(old, secret)).toBeNull();
    // The web's state, a mark nobody signed, another secret, rubbish.
    expect(startedInApp(signState(state, secret), secret)).toBe(false);
    expect(startedInApp(signState({ ...state, app: "yes" as unknown as true }, secret), secret)).toBe(false);
    const added = `${Buffer.from(JSON.stringify({ ...state, app: true })).toString("base64url")}.${signState(state, secret).split(".")[1]}`;
    expect(startedInApp(added, secret)).toBe(false);
    expect(startedInApp(fromApp, "another-secret")).toBe(false);
    expect(startedInApp(`${fromApp}x`, secret)).toBe(false);
    expect(startedInApp("not.a.state", secret)).toBe(false);
    expect(startedInApp(null, secret)).toBe(false);
    expect(startedInApp(undefined, secret)).toBe(false);
  });
});

describe("pkceFor (RFC 7636)", () => {
  const secret = "a-secret-that-is-long-enough-for-hmac";

  it("gives a verifier of the allowed shape and its S256 challenge, the same again for the same nonce", () => {
    const pair = pkceFor("nonce-1", secret);
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pair.challenge).toBe(createHash("sha256").update(pair.verifier).digest("base64url"));
    expect(pkceFor("nonce-1", secret)).toEqual(pair);
  });

  it("cannot be worked out from the nonce alone: another secret, or another nonce, gives another verifier", () => {
    const pair = pkceFor("nonce-1", secret);
    expect(pkceFor("nonce-1", "another-secret").verifier).not.toBe(pair.verifier);
    expect(pkceFor("nonce-2", secret).verifier).not.toBe(pair.verifier);
  });
});
