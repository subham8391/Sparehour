import { describe, expect, it } from "vitest";
import { signState, verifyState } from "./state";

describe("OAuth state", () => {
  const secret = "a-secret-that-is-long-enough-for-hmac";
  const state = { userId: "u1", purpose: "read" as const, next: "/settings", nonce: "n1", exp: 2_000_000_000 };

  it("round-trips a signed state", () => {
    expect(verifyState(signState(state, secret), secret, 1_999_999_000)).toEqual(state);
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
});
