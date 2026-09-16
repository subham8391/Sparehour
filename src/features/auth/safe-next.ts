/**
 * Only a same-origin path may be the destination after sign-in; anything
 * else lands on Today. Resolved with the URL parser rather than by prefix:
 * a tab or newline inside "/<tab>/evil.com" is stripped by that parser, which
 * turns a "path" into another origin, so control characters and backslashes
 * are refused outright and the parsed origin is compared.
 */
const BASE = "http://sparehour.invalid";
const CONTROL_OR_BACKSLASH = /[\x00-\x1f\x7f\\]/;

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || CONTROL_OR_BACKSLASH.test(next)) return "/today";
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return "/today";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/today";
  }
}
