// Every look keeps text readable (DECISIONS.md, amendment 2026-10-20): each light and dark set is read from its
// stylesheet (Sky from globals.css, the rest from public/looks/) and its text tokens are held to WCAG AA on the page
// and on cards, the controls' ring to 3:1. The controls' own text is held to AA on the fill the look gives it: the
// primary button, the phone's add button and the segmented control. A look whose sheet breaks this fails here
// before anyone sees it.
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
/** A colour token followed through its `var()` references; null for anything else (transparent, a wash, a mix). */
function resolve(t: Tokens, value: string | undefined, depth = 0): string | null {
  const ref = value && /^var\(--([a-z0-9-]+)\)$/.exec(value.trim());
  if (ref) return depth > 8 ? null : resolve(t, t[ref[1]], depth + 1);
  return hex(value);
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
    for (const edge of ["check-line", "switch-off"]) {
      const c = resolve(t, t[edge]);
      expect(c, `${name}: ${edge} is a plain colour`).not.toBeNull();
      expect(ratio(c!, bg), `${name}: ${edge} ${c} on ${g} ${bg}`).toBeGreaterThanOrEqual(3);
    }
  }
  // Text on a fill that is not a plain colour (an outline's transparent, the dark rail's wash) is held on what shows
  // through it: the segmented tile's on the rail, the rest on the page and the card.
  const rail = resolve(t, t.seg);
  const under = (fill: string): string[] => {
    const own = resolve(t, t[fill]);
    if (own) return [own];
    if (fill === "seg-on" && rail) return [rail];
    return grounds.map((g) => g[1]);
  };
  for (const [text, fill] of [["btn-ink", "btn"], ["fab-ink", "fab"], ["btn-2-ink", "surface"], ["seg-ink", "seg"], ["seg-on-ink", "seg-on"]]) {
    const fg = resolve(t, t[text]);
    expect(fg, `${name}: ${text} is a plain colour`).not.toBeNull();
    for (const bg of under(fill)) expect(ratio(fg!, bg), `${name}: ${text} ${fg} on ${fill} ${bg}`).toBeGreaterThanOrEqual(4.5);
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
    check("sky dark", { ...skyLight, ...skyDark });
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
      // Sky's light block sits under its dark one, as in the cascade: the controls' defaults are declared once there.
      check(`${id} dark`, { ...skyLight, ...skyDark, ...light, ...dark });
    });
  }

  it("every look the picker offers has its stylesheet, and every stylesheet is in the catalogue", () => {
    const sheets = new Set(files.map((f) => f.replace(/\.css$/, "")));
    for (const look of LOOKS.filter((l) => l.ready && l.id !== "sky")) expect(sheets.has(look.id), `${look.id} has public/looks/${look.id}.css`).toBe(true);
    for (const id of sheets) expect(LOOKS.some((l) => l.id === id), `${id} is in catalog.ts`).toBe(true);
  });
});
