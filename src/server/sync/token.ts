// The sync token (SYSTEM_DESIGN.md §9.2): a short-lived JWT for the PowerSync
// service instead of the Supabase session. Five minutes, audience
// "powersync", no Supabase role claims — a leaked one cannot be replayed
// against PostgREST or Storage. HS256 with a secret shared with the service
// at M1; the shape is what an RS256 key pair would sign later.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SYNC_TOKEN_AUDIENCE = "powersync";
export const SYNC_TOKEN_KID = "sparehour-sync-v1";
export const SYNC_TOKEN_TTL_SECONDS = 5 * 60;

export interface SyncTokenClaims {
  sub: string;
  aud: string;
  iat: number;
  exp: number;
  app_ver?: string;
}

const b64url = (input: Buffer | string): string => Buffer.from(input).toString("base64url");

/** Signs `{ sub, aud, iat, exp, app_ver }` for the user; `now` is seconds since the epoch. */
export function signSyncToken(opts: { userId: string; secret: string; now?: number; ttlSeconds?: number; appVersion?: string }): { token: string; expiresAt: number } {
  if (opts.secret.length < 32) throw new Error("POWERSYNC_JWT_SECRET must be at least 32 characters");
  const iat = opts.now ?? Math.floor(Date.now() / 1000);
  const exp = iat + (opts.ttlSeconds ?? SYNC_TOKEN_TTL_SECONDS);
  const claims: SyncTokenClaims = { sub: opts.userId, aud: SYNC_TOKEN_AUDIENCE, iat, exp, ...(opts.appVersion ? { app_ver: opts.appVersion } : {}) };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: SYNC_TOKEN_KID }));
  const payload = b64url(JSON.stringify(claims));
  const signature = createHmac("sha256", opts.secret).update(`${header}.${payload}`).digest("base64url");
  return { token: `${header}.${payload}.${signature}`, expiresAt: exp };
}

/** What the service does: checks the signature and the times; the claims when they hold. */
export function verifySyncToken(token: string, secret: string, now = Math.floor(Date.now() / 1000)): SyncTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let claims: SyncTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SyncTokenClaims;
  } catch {
    return null;
  }
  if (claims.aud !== SYNC_TOKEN_AUDIENCE || typeof claims.sub !== "string" || !claims.sub) return null;
  if (typeof claims.iat !== "number" || typeof claims.exp !== "number" || claims.exp <= now || claims.iat > now + 60) return null;
  return claims;
}
