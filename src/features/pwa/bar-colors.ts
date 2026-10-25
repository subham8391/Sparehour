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

/** The manifest link for these colours: Chrome reads the installed app's navigation bar from the manifest it fetches. */
export const manifestHref = (bar: string, paper: string) => `${MANIFEST_PATH}?bar=${bar.slice(1)}&paper=${paper.slice(1)}`;
