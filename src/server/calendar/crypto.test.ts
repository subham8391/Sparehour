import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, openFromBase64, parseTokenKey, sealToBase64 } from "./crypto";

describe("calendar token encryption", () => {
  const key = randomBytes(32);

  it("round-trips, with a fresh IV every time and iv ‖ ciphertext ‖ tag on the wire", () => {
    const a = encryptSecret("ya29.refresh-token", key);
    const b = encryptSecret("ya29.refresh-token", key);
    expect(a.equals(b)).toBe(false);
    expect(a.length).toBe(12 + "ya29.refresh-token".length + 16);
    expect(decryptSecret(a, key)).toBe("ya29.refresh-token");
    expect(openFromBase64(sealToBase64("x", key), key)).toBe("x");
  });

  it("refuses a tampered value or the wrong key", () => {
    const sealed = encryptSecret("secret", key);
    const flipped = Buffer.from(sealed);
    flipped[14] ^= 0x01;
    expect(() => decryptSecret(flipped, key)).toThrow();
    expect(() => decryptSecret(sealed, randomBytes(32))).toThrow();
    expect(() => decryptSecret(Buffer.alloc(5), key)).toThrow(/too short/);
  });

  it("parses the key from base64 and rejects anything but 32 bytes", () => {
    expect(parseTokenKey(key.toString("base64")).equals(key)).toBe(true);
    expect(() => parseTokenKey(undefined)).toThrow(/not set/);
    expect(() => parseTokenKey(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
