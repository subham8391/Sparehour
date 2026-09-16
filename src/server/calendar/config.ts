// Environment for the calendar integration (SYSTEM_DESIGN.md §9.4). Nothing
// here is exposed to the browser; the login and settings pages ask a route
// whether Google is configured rather than reading these.
import { timingSafeEqual } from "node:crypto";
import { parseTokenKey } from "./crypto";
import type { GoogleOAuthConfig } from "./google";

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function googleOAuth(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${appUrl()}/api/calendar/google/callback` };
}

export const googleConfigured = (): boolean => googleOAuth() !== null && Boolean(process.env.CALENDAR_TOKEN_KEY);

export const tokenKey = (): Buffer => parseTokenKey(process.env.CALENDAR_TOKEN_KEY);

/** The state signature and the channel token share the token key's secret material. */
export const stateSecret = (): string => process.env.CALENDAR_TOKEN_KEY ?? "";

/** Push channels need a public HTTPS address and a token secret (§6.4); otherwise the hourly reconcile alone runs. */
export function webhook(): { address: string; secret: string } | null {
  const secret = process.env.GOOGLE_WEBHOOK_TOKEN_SECRET;
  const base = appUrl();
  if (!secret || !base.startsWith("https://")) return null;
  return { address: `${base}/api/webhooks/google-calendar`, secret };
}

/** The shared secret pg_cron presents to every tick route. */
export const jobSecret = (): string | undefined => process.env.PUSH_TICK_SECRET;

/** Constant-time comparison of a presented secret with the configured one; false when either is missing. */
export function secretMatches(presented: string | null | undefined, expected: string | undefined): boolean {
  if (!presented || !expected) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A 36-character uuid, the only shape an id from the outside may have. */
export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
