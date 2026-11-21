// Every look keeps text readable (DECISIONS.md, amendment 2026-10-20): each light and dark set is read from its
// stylesheet (Sky from globals.css, the rest from public/looks/) and its text tokens are held to WCAG AA on the page
// and on cards, the controls' ring to 3:1. The controls' own text is held to AA on the fill the look gives it: the
// primary button, the phone's add button and the segmented control. A look whose sheet breaks this fails here
// before anyone sees it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOOKS } from "./catalog";
import { contrastProblems, type Tokens } from "./contrast";

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

/** One theme's tokens: the look's own over the defaults it does not redefine (Sky's, for the same theme). The rule itself is contrast.ts. */
function check(name: string, t: Tokens) {
  expect(contrastProblems(name, t)).toEqual([]);
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
