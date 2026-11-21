// The two links that bring a browser session back into the app, and how they are read. Both are answers to
// something this app started in the system browser (a Google sign-in, a calendar consent), never screens. Anything
// on the phone can open a `sparehour://` link, so what one carries is never trusted here: the sign-in code is only
// good with the verifier kept on this device, and the calendar ticket only with this person's sign-in token on the
// server. No imports from the app, so it is tested as it is.
import { CALENDAR_APP_LINK } from "@/features/calendar/app-link";

/** Where Supabase Auth sends a Google sign-in back to. It must be on the auth server's redirect allow-list. */
export const AUTH_RETURN_LINK = "sparehour://auth/callback";

export { CALENDAR_APP_LINK };

function readPairs(text: string, into: Record<string, string>): void {
  for (const pair of text.split("&")) {
    if (!pair) continue;
    const at = pair.indexOf("=");
    try {
      const name = decodeURIComponent((at < 0 ? pair : pair.slice(0, at)).replace(/\+/g, " "));
      // The query says it first; the part after `#` only adds what the query does not have.
      if (name && !(name in into)) into[name] = decodeURIComponent((at < 0 ? "" : pair.slice(at + 1)).replace(/\+/g, " "));
    } catch {
      // A pair that is not properly encoded is left out.
    }
  }
}

/**
 * What a link back into the app carries, when it is exactly `link` (nothing before the `?` may differ: not the
 * scheme, not a longer path), or null when it is some other address.
 */
export function readReturnLink(url: string, link: string): Record<string, string> | null {
  const hashAt = url.indexOf("#");
  const beforeHash = hashAt < 0 ? url : url.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  if ((queryAt < 0 ? beforeHash : beforeHash.slice(0, queryAt)) !== link) return null;
  const params: Record<string, string> = Object.create(null) as Record<string, string>;
  if (queryAt >= 0) readPairs(beforeHash.slice(queryAt + 1), params);
  if (hashAt >= 0) readPairs(url.slice(hashAt + 1), params);
  return params;
}

/** One of the two links a browser session comes back on. */
export const isReturnLink = (url: string): boolean => readReturnLink(url, AUTH_RETURN_LINK) !== null || readReturnLink(url, CALENDAR_APP_LINK) !== null;

/**
 * For Expo Router's `redirectSystemPath` (app/+native-intent.ts, carried out in ~/share/native-intent.ts): a return
 * link is not a screen. While the app is open, the session that is waiting for it reads it (browser-session.ts) and
 * the router goes nowhere; if the app was closed in the meantime and the link is what opens it, the session is gone
 * with it and the app opens on Today. Every other address is handed back as it came.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (!isReturnLink(path)) return path;
  return initial ? "/" : null;
}
