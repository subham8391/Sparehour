// Token encryption (SYSTEM_DESIGN.md §6.2, §9.4): AES-256-GCM with a random
// 96-bit IV per value, stored as iv ‖ ciphertext ‖ tag. The key lives only in
// the app's environment (CALENDAR_TOKEN_KEY, 32 bytes base64), never in the
// database, so a database backup alone cannot impersonate anyone at Google.
// key_version travels with each row so the key can be rotated: decrypt with
// the old, encrypt with the new on the next touch.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;

export const CURRENT_KEY_VERSION = 1;

/** The 32-byte key from its base64 form; throws early on a bad key rather than at first use. */
export function parseTokenKey(base64: string | undefined): Buffer {
  if (!base64) throw new Error("CALENDAR_TOKEN_KEY is not set");
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("CALENDAR_TOKEN_KEY must decode to 32 bytes");
  return key;
}

export function encryptSecret(plain: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]);
}

export function decryptSecret(sealed: Buffer, key: Buffer): string {
  if (sealed.length < IV_BYTES + TAG_BYTES) throw new Error("sealed value too short");
  const iv = sealed.subarray(0, IV_BYTES);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);
  const body = sealed.subarray(IV_BYTES, sealed.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

/** Base64 of the sealed value, the form the database functions take and return. */
export const sealToBase64 = (plain: string, key: Buffer): string => encryptSecret(plain, key).toString("base64");
export const openFromBase64 = (b64: string, key: Buffer): string => decryptSecret(Buffer.from(b64, "base64"), key);
