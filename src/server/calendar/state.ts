// The OAuth `state` parameter: who started the dance, why, and where to go
// afterwards — signed, so the callback can trust it, and short-lived. No
// table is needed; the signature is the record.
import { createHmac, timingSafeEqual } from "node:crypto";

/** read: busy times (the default connect); write: the app-created calendar; full: titles and the person's own calendars. */
export type ConsentPurpose = "read" | "write" | "full";

export interface OAuthState {
  userId: string;
  purpose: ConsentPurpose;
  next: string;
  nonce: string;
  exp: number; // unix seconds
}

export const STATE_TTL_SECONDS = 10 * 60;

const b64url = (s: Buffer | string) => Buffer.from(s).toString("base64url");
const sign = (payload: string, secret: string) => createHmac("sha256", `oauth-state:${secret}`).update(payload).digest("base64url");

export function signState(state: OAuthState, secret: string): string {
  const payload = b64url(JSON.stringify(state));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyState(token: string | null | undefined, secret: string, now = Math.floor(Date.now() / 1000)): OAuthState | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (typeof state.userId !== "string" || typeof state.exp !== "number" || state.exp < now) return null;
    if (state.purpose !== "read" && state.purpose !== "write" && state.purpose !== "full") return null;
    return state;
  } catch {
    return null;
  }
}
