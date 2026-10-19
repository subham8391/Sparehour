// Every look keeps text readable (DECISIONS.md, amendment 2026-10-20): each light and dark set is read from its
// stylesheet (Sky from globals.css, the rest from public/looks/) and its text tokens are held to WCAG AA on the page
// and on cards, the controls' ring to 3:1. A look whose sheet breaks this fails here before anyone sees it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOOKS } from "./catalog";

type Tokens = Record<string, string>;

/** The custom properties declared directly in each block whose selector matches. */
function blocks(css: string, match: (selector: string) => boolean): Tokens[] {
  const out: Tokens[] = [];
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(plain); m; m = re.exec(plain)) {
    if (!match(m[1].trim())) continue;
    const t: Tokens = {};
    for (const d of m[2].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) t[d[1]] = d[2].trim();
    out.push(t);
  }
  return out;
}

const hex = (v: string | undefined) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
function luminance(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** One theme's tokens: the look's own over the defaults it does not redefine (Sky's, for the same theme). */
function check(name: string, t: Tokens) {
  const grounds = ["paper", "surface"].map((k) => [k, hex(t[k])] as const).filter((g): g is readonly [string, string] => g[1] !== null);
  expect(grounds.length, `${name}: paper and surface are plain colours`).toBe(2);
  for (const [g, bg] of grounds) {
    for (const text of ["ink", "ink-2", "ink-3", "spare", "meet", "over", "deadline"]) {
      const fg = hex(t[text]);
      if (!fg) continue;
      expect(ratio(fg, bg), `${name}: ${text} ${fg} on ${g} ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    const ring = hex(t["line-control"]);
    if (ring) expect(ratio(ring, bg), `${name}: line-control ${ring} on ${g} ${bg}`).toBeGreaterThanOrEqual(3);
  }
}

const root = process.cwd();
const globals = readFileSync(join(root, "src/app/globals.css"), "utf8");
// The light :root blocks (the first follows the @import and @source lines, so only its end is the selector).
const skyLight: Tokens = Object.assign({}, ...blocks(globals, (s) => /(^|[;\s]):root$/.test(s)));
const skyDark = blocks(globals, (s) => s === ':root[data-theme="dark"]')[0];

describe("every look's text holds WCAG AA", () => {
  it("Sky, light and dark", () => {
    check("sky light", skyLight);
    check("sky dark", skyDark);
  });

  const files = readdirSync(join(root, "public/looks")).filter((f) => f.endsWith(".css"));
  for (const file of files) {
    const id = file.replace(/\.css$/, "");
    it(`${id}, light and dark`, () => {
      const css = readFileSync(join(root, "public/looks", file), "utf8");
      const light = blocks(css, (s) => s === `:root[data-look="${id}"]`)[0];
      const dark = blocks(css, (s) => s === `:root[data-look="${id}"][data-theme="dark"]`)[0];
      expect(light, `${file} has its light block`).toBeTruthy();
      expect(dark, `${file} has its dark block`).toBeTruthy();
      check(`${id} light`, { ...skyLight, ...light });
      check(`${id} dark`, { ...skyDark, ...light, ...dark });
    });
  }

  it("every look the picker offers has its stylesheet, and every stylesheet is in the catalogue", () => {
    const sheets = new Set(files.map((f) => f.replace(/\.css$/, "")));
    for (const look of LOOKS.filter((l) => l.ready && l.id !== "sky")) expect(sheets.has(look.id), `${look.id} has public/looks/${look.id}.css`).toBe(true);
    for (const id of sheets) expect(LOOKS.some((l) => l.id === id), `${id} is in catalog.ts`).toBe(true);
  });
});
