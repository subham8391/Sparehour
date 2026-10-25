// The colours the phone's own bars take (DECISIONS.md, amendment 2026-10-25): the status bar the look's paper, the
// navigation bar the tab bar's surface. Read from the page as drawn, so every look and theme is right without a table
// of them. Pure helpers; system-bars.tsx applies them, app/manifest.webmanifest reads them back.

/** "#rrggbb" for a computed CSS colour ("rgb(…)" / "rgba(…)"), laid over `under` when it is see-through; null if unreadable. */
export function cssToHex(css: string, under: [number, number, number] = [255, 255, 255]): string | null {
  const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/i.exec(css);
  if (!m) return null;
  const alphaRaw = m[4];
  const a = alphaRaw === undefined ? 1 : alphaRaw.endsWith("%") ? Number(alphaRaw.slice(0, -1)) / 100 : Number(alphaRaw);
  const mix = (c: number, i: number) => Math.round(c * a + under[i] * (1 - a));
  return `#${[Number(m[1]), Number(m[2]), Number(m[3])].map((c, i) => mix(c, i).toString(16).padStart(2, "0")).join("")}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A "rrggbb" query value, or null for anything else (the manifest echoes only what it can trust). */
export function hexParam(v: string | null): string | null {
  return v && /^[0-9a-f]{6}$/i.test(v) ? `#${v.toLowerCase()}` : null;
}

export const MANIFEST_PATH = "/manifest.webmanifest";

/**
 * The cookie that carries the same two colours, so the manifest is right on the very first fetch of a page (Chrome
 * fetches it as the page loads, before the page has said anything; the link is crossorigin="use-credentials" so the
 * cookie goes with it). "rrggbb.rrggbb": the bar, then the paper.
 */
export const BARS_COOKIE = "sparehour-bars";
export const barsCookie = (bar: string, paper: string) => `${BARS_COOKIE}=${bar.slice(1)}.${paper.slice(1)}; Path=/; Max-Age=31536000; SameSite=Lax`;

/** The two colours from a Cookie header, each null when absent or not a plain hex colour. */
export function barsFromCookie(header: string | null): { bar: string | null; paper: string | null } {
  const raw = header?.split(/;\s*/).find((c) => c.startsWith(`${BARS_COOKIE}=`))?.slice(BARS_COOKIE.length + 1) ?? "";
  const [bar = null, paper = null] = raw.split(".");
  return { bar: hexParam(bar), paper: hexParam(paper) };
}

/** The manifest link for these colours: Chrome reads the installed app's navigation bar from the manifest it fetches. */
export const manifestHref = (bar: string, paper: string) => `${MANIFEST_PATH}?bar=${bar.slice(1)}&paper=${paper.slice(1)}`;
