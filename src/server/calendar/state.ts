// The OAuth `state` parameter: who started the dance, why, and where to go
// afterwards — signed, so the callback can trust it, and short-lived. No
// table is needed; the signature is the record.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** read: busy times (the default connect); write: the app-created calendar; full: titles and the person's own calendars. */
export type ConsentPurpose = "read" | "write" | "full";

export interface OAuthState {
  userId: string;
  purpose: ConsentPurpose;
  /** Whose consent this state was signed for. Absent on Google's (it came first); the Microsoft callback insists on its own. */
  provider?: "google" | "microsoft";
  next: string;
  nonce: string;
  exp: number; // unix seconds
  /**
   * Started in the phone app (`/api/calendar/<provider>/app-start`), where no cookie says who is in the browser that
   * comes back. The callback then saves nothing: it seals the code into a ticket for the app, and only the person
   * this state names can finish it (`app-finish`). Never set by the web's start.
   */
  app?: true;
}

export const STATE_TTL_SECONDS = 10 * 60;

const b64url = (s: Buffer | string) => Buffer.from(s).toString("base64url");
const sign = (payload: string, secret: string) => createHmac("sha256", `oauth-state:${secret}`).update(payload).digest("base64url");

export function signState(state: OAuthState, secret: string): string {
  const payload = b64url(JSON.stringify(state));
  return `${payload}.${sign(payload, secret)}`;
}

/** The state when the signature is ours and its shape is known, whatever its age: only `verifyState` says it may be acted on. */
function readSigned(token: string | null | undefined, secret: string): OAuthState | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (typeof state.userId !== "string" || typeof state.exp !== "number") return null;
    if (state.purpose !== "read" && state.purpose !== "write" && state.purpose !== "full") return null;
    return state;
  } catch {
    return null;
  }
}

export function verifyState(token: string | null | undefined, secret: string, now = Math.floor(Date.now() / 1000)): OAuthState | null {
  const state = readSigned(token, secret);
  if (!state || state.exp < now) return null;
  return state;
}

/**
 * Whether a state we signed was started in the phone app, even one that has since expired. It answers one question
 * only, where to send the person back to with "try again" (the app, not a web page they are not signed in to), and
 * hands out nothing of the state itself: an expired state is still never acted on.
 */
export const startedInApp = (token: string | null | undefined, secret: string): boolean => readSigned(token, secret)?.app === true;

/**
 * The PKCE pair for one consent (RFC 7636, which Microsoft recommends for every client): the verifier is derived from
 * the state's nonce under the server's secret, so the callback works it out again from the state it verified and
 * nothing is kept between the two requests. Someone who sees the state and the code still cannot redeem the code.
 */
export function pkceFor(nonce: string, secret: string): { verifier: string; challenge: string } {
  const verifier = createHmac("sha256", `oauth-pkce:${secret}`).update(nonce).digest("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
