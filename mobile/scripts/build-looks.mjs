// Every look, for the phone (docs/mobile/ANDROID_APP_SPEC.md §9; DECISIONS.md, amendment 2026-10-20). A phone app
// cannot read a stylesheet, so this reads the web's own (Sky from ../src/app/globals.css, every other look from
// ../public/looks/<id>.css) and writes what they come to as plain values: src/ui/looks/generated.ts. Nothing about a
// look is typed in by hand on the phone; change the look on the web, then run this.
//
//   node scripts/build-looks.mjs           writes the file
//   node scripts/build-looks.mjs --check   exits 1 when the file is out of step with the stylesheets (the test runs it)
//
// How a stylesheet becomes values:
// - The cascade is replayed for each look and theme: Sky's light block, Sky's dark block (dark only), the look's own
//   block, the look's dark block (dark only). `var()` is followed afterwards, as a browser does at computed-value time.
// - `rgb(r g b / a)` becomes `rgba(r, g, b, a)`; `color-mix(in oklab, …)` is worked out in Oklab with premultiplied
//   alpha, as CSS Color 5 says, and rounded to 8-bit sRGB; `oklch()` is converted and clipped to sRGB.
// - A backdrop that is one top-to-bottom gradient becomes its three colours (the sky, per part of the day). Any other
//   backdrop (a dot grid, a plan's grid, print grain over the page colour) becomes the flat page colour.
// - Shadows become React Native `boxShadow` strings with their colours resolved. Radii become numbers, or four
//   corners where the look draws an uneven shape.
// Not carried, because they are rules about one web element and not values: a look's own selectors below its token
// blocks (the hard edge on Studio's glass card, Riso's misregistered title, …), `backdrop-filter`, background
// patterns, and the `--daylight` wash of the web's timeline pane.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const OUT = join(here, "..", "src", "ui", "looks", "generated.ts");

// ---- Reading a stylesheet

/** Every rule as its selector and the custom properties it declares, in source order. */
function rules(css) {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(plain); m; m = re.exec(plain)) {
    const decls = {};
    for (const d of m[2].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) decls[d[1]] = d[2].trim();
    out.push({ selector: m[1].trim(), decls });
  }
  return out;
}
const merged = (all, match) => Object.assign({}, ...all.filter((r) => match(r.selector)).map((r) => r.decls));

/** A value with every `var()` followed (a missing name takes its fallback, or stays empty: "unset"). */
function follow(tokens, value, depth = 0) {
  if (depth > 12) throw new Error(`var() loop in ${value}`);
  let out = "";
  for (let i = 0; i < value.length; ) {
    if (!value.startsWith("var(", i)) {
      out += value[i++];
      continue;
    }
    let level = 0;
    let end = i + 3;
    for (; end < value.length; end++) {
      if (value[end] === "(") level++;
      else if (value[end] === ")" && --level === 0) break;
    }
    const inner = value.slice(i + 4, end);
    const comma = inner.indexOf(",");
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim().replace(/^--/, "");
    const fallback = comma < 0 ? "" : inner.slice(comma + 1).trim();
    out += name in tokens ? follow(tokens, tokens[name], depth + 1) : follow(tokens, fallback, depth + 1);
    i = end + 1;
  }
  return out.trim();
}

// ---- Colours

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB (0–1) to Oklab, and back (Björn Ottosson's matrices, the ones CSS Color 4 uses). */
function oklab([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((c) => clamp01(toGamma(c)));
}

/** Splits on a separator outside any brackets. */
function split(text, separator) {
  const parts = [];
  let level = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") level++;
    else if (text[i] === ")") level--;
    else if (level === 0 && text[i] === separator) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts.map((p) => p.trim()).filter((p) => p !== "");
}
const number = (text, of = 1) => (text.endsWith("%") ? (parseFloat(text) / 100) * of : parseFloat(text));

/** A resolved CSS colour as { rgb: [0–1 ×3], a }, or null when it is not a colour. */
function parseColour(text) {
  const v = text.trim().toLowerCase();
  if (v === "transparent") return { rgb: [0, 0, 0], a: 0 };
  if (v === "white") return { rgb: [1, 1, 1], a: 1 };
  if (v === "black") return { rgb: [0, 0, 0], a: 1 };
  const hex = /^#([0-9a-f]{3,8})$/.exec(v);
  if (hex && [3, 4, 6, 8].includes(hex[1].length)) {
    const h = hex[1].length <= 4 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    const at = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { rgb: [at(0), at(2), at(4)], a: h.length === 8 ? at(6) : 1 };
  }
  const fn = /^([a-z-]+)\((.*)\)$/.exec(v);
  if (!fn) return null;
  const [, name, body] = fn;
  if (name === "rgb" || name === "rgba") {
    const [channels, alpha] = body.includes("/") ? body.split("/").map((s) => s.trim()) : [body, null];
    const parts = channels.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const a = alpha ?? parts[3] ?? "1";
    return { rgb: parts.slice(0, 3).map((p) => clamp01(number(p, 255) / 255)), a: clamp01(number(a)) };
  }
  if (name === "oklch") {
    const [channels, alpha] = body.split("/").map((s) => s.trim());
    const [l, c, h] = channels.split(/\s+/);
    const hue = (parseFloat(h) * Math.PI) / 180;
    const chroma = number(c, 0.4);
    return { rgb: fromOklab([number(l), chroma * Math.cos(hue), chroma * Math.sin(hue)]), a: alpha ? clamp01(number(alpha)) : 1 };
  }
  if (name === "color-mix") {
    const [space, first, second] = split(body, ",");
    if (space !== "in oklab" || !first || !second) throw new Error(`color-mix this script cannot work out: ${text}`);
    const part = (p) => {
      const m = /^(.*?)(?:\s+([\d.]+)%)?$/.exec(p);
      const colour = parseColour(m[1]);
      if (!colour) throw new Error(`color-mix of something that is not a colour: ${text}`);
      return { colour, share: m[2] === undefined ? null : parseFloat(m[2]) / 100 };
    };
    const a = part(first);
    const b = part(second);
    let p1 = a.share ?? (b.share === null ? 0.5 : 1 - b.share);
    let p2 = b.share ?? 1 - p1;
    const sum = p1 + p2;
    if (sum <= 0) throw new Error(`color-mix with nothing in it: ${text}`);
    // Shares that fall short of the whole leave the rest transparent (CSS Color 5 §3.1).
    const fade = Math.min(1, sum);
    p1 /= sum;
    p2 /= sum;
    const A = oklab(a.colour.rgb);
    const B = oklab(b.colour.rgb);
    const alpha = a.colour.a * p1 + b.colour.a * p2;
    // Premultiplied: a transparent side gives its share of nothing, not of black.
    const mixed = alpha === 0 ? [0, 0, 0] : [0, 1, 2].map((i) => (A[i] * a.colour.a * p1 + B[i] * b.colour.a * p2) / alpha);
    return { rgb: fromOklab(mixed), a: alpha * fade };
  }
  return null;
}

const byte = (c) => Math.round(clamp01(c) * 255);
const round = (n, places = 3) => Number(n.toFixed(places));
/** As React Native takes it: #rrggbb when solid, rgba() otherwise. */
function colourOut({ rgb, a }) {
  const [r, g, b] = rgb.map(byte);
  if (a >= 0.999) return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  if (a <= 0) return "transparent";
  return `rgba(${r}, ${g}, ${b}, ${round(a)})`;
}

// ---- One look in one theme

/** The colours a screen can ask for, by the web's own names (camel case here). */
const COLOURS = [
  "paper", "surface", "surface-2", "surface-3", "hover", "press", "scrim", "line", "line-strong", "line-control", "ink", "ink-2", "ink-3", "ink-4", "ink-inverse",
  "spare", "spare-fill", "spare-soft", "spare-line", "meet", "meet-fill", "meet-soft", "meet-line", "over", "over-fill", "over-soft", "over-line",
  "deadline", "deadline-fill", "deadline-soft", "deadline-line", "block-fill", "block-soft", "hatch", "meet-soft-past", "block-soft-past", "raised-border",
  "glass", "bar", "chrome", "elapsed", "btn", "btn-ink", "btn-2-ink", "btn-2-line", "seg", "seg-ink", "seg-hover", "seg-on", "seg-on-ink", "check-line", "switch-off", "fab", "fab-ink", "track",
];
/** Colours a look may leave unset: a border that is then not drawn. */
const OPTIONAL_COLOURS = ["btn-line", "seg-line"];
const SHADOWS = { raised: "shadow-2", float: "shadow-float", fab: "shadow-fab", active: "shadow-active", btn: "btn-shadow", btn2: "btn-2-shadow", seg: "seg-shadow", segOn: "seg-on-shadow" };
const DAY_PARTS = ["morning", "afternoon", "evening", "night"];

const camel = (name) => name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

function colourOf(tokens, name, where) {
  const value = follow(tokens, tokens[name] ?? "");
  const colour = value === "" ? null : parseColour(value);
  if (!colour) throw new Error(`${where}: --${name} is not a colour this script can read: "${tokens[name]}" → "${value}"`);
  return colourOut(colour);
}

/** A CSS shadow list as a React Native boxShadow string, every colour resolved; null for none. */
function shadowOf(tokens, name, where) {
  const value = follow(tokens, tokens[name] ?? "");
  if (value === "" || value === "none") return null;
  const layers = split(value, ",").map((layer) => {
    // Lengths first, then the colour, which is the one piece that is not a length or `inset`.
    const pieces = split(layer, " ");
    const out = [];
    let colour = null;
    for (const piece of pieces) {
      if (piece === "inset" || /^-?[\d.]+(px)?$/.test(piece)) out.push(piece === "inset" || piece.endsWith("px") || piece === "0" ? piece : `${piece}px`);
      else {
        const c = parseColour(piece);
        if (!c) throw new Error(`${where}: --${name} has a piece this script cannot read: "${piece}"`);
        colour = c;
      }
    }
    return colour ? (colour.a <= 0 ? null : `${out.join(" ")} ${colourOut(colour)}`) : out.join(" ");
  });
  const drawn = layers.filter(Boolean);
  return drawn.length > 0 ? drawn.join(", ") : null;
}

/** The backdrop as three colours top to bottom, or null for a flat page. */
function gradientOf(value) {
  const m = /^linear-gradient\((.*)\)$/.exec(value.trim());
  if (!m) return null;
  const parts = split(m[1], ",");
  if (parts[0] !== "180deg" && parts[0] !== "to bottom") return null;
  const stops = parts.slice(1).map((p) => parseColour(p.replace(/\s+[\d.]+%$/, "")));
  if (stops.length !== 3 || stops.some((s) => !s)) return null;
  return stops.map(colourOut);
}

function theme(tokens, dayparts, where) {
  const colours = {};
  for (const name of COLOURS) colours[camel(name)] = colourOf(tokens, name, where);
  for (const name of OPTIONAL_COLOURS) colours[camel(name)] = name in tokens ? colourOf(tokens, name, where) : "transparent";
  const shadows = {};
  for (const [key, name] of Object.entries(SHADOWS)) shadows[key] = shadowOf(tokens, name, where);
  let sky = {};
  for (const part of DAY_PARTS) {
    const gradient = gradientOf(follow({ ...tokens, ...dayparts[part] }, tokens.backdrop ?? "none"));
    if (!gradient) {
      sky = null;
      break;
    }
    sky[part] = gradient;
  }
  return { colours, shadows, sky };
}

// ---- Shape

/** `max(0px, calc(14px - 4px - 0px))` and the like, in points. */
function length(value, where) {
  const plain = value.trim();
  if (plain === "normal" || plain === "none" || plain === "auto") return 0;
  const sum = plain.replace(/px/g, "").replace(/calc\(/g, "(").replace(/max\(/g, "Math.max(").replace(/min\(/g, "Math.min(");
  if (!/^[\d\s.+\-*/(),Mathminx]+$/.test(sum)) throw new Error(`${where}: a length this script cannot work out: "${value}"`);
  const n = Function(`"use strict"; return (${sum});`)();
  if (typeof n !== "number" || !Number.isFinite(n)) throw new Error(`${where}: a length this script cannot work out: "${value}"`);
  return round(n, 2);
}
/** One radius, or four corners (top-left, top-right, bottom-right, bottom-left) where the look is uneven. */
function radius(tokens, name, where) {
  const value = follow(tokens, tokens[name] ?? "");
  const corner = (c) => (c.endsWith("%") ? c : length(c, `${where} --${name}`));
  const parts = split(value, " ");
  const simple = /^(max|min|calc)\(/.test(value) || parts.length === 1;
  if (simple) return corner(value);
  if (parts.length !== 4) throw new Error(`${where}: --${name} is not one radius or four: "${value}"`);
  return parts.map(corner);
}
const NEXT_FONTS = { "font-jakarta": "Plus Jakarta Sans", "font-newsreader": "Newsreader", "font-newsreader-italic": "Newsreader", "font-instrument-sans": "Instrument Sans" };
/** The first family a face names. */
function face(tokens, name) {
  const value = follow({ ...NEXT_FONTS, ...tokens }, tokens[name] ?? "");
  return split(value, ",")[0].replace(/^["']|["']$/g, "");
}
const em = (tokens, name) => {
  const value = follow(tokens, tokens[name] ?? "normal");
  return value === "normal" ? 0 : round(parseFloat(value), 3);
};

function shape(tokens, where) {
  const r = (name) => radius(tokens, name, where);
  const px = (name) => length(follow(tokens, tokens[name] ?? "0"), `${where} --${name}`);
  const word = (name) => follow(tokens, tokens[name] ?? "");
  const controlCase = word("control-case");
  if (!["none", "uppercase", "lowercase"].includes(controlCase)) throw new Error(`${where}: --control-case "${controlCase}"`);
  return {
    radius: { xs: r("r-xs"), sm: r("r-sm"), lg: r("r-lg"), xl: r("r-xl"), sheet: r("r-sheet"), fab: r("r-fab"), control: r("r-control"), seg: r("r-seg"), segOn: r("r-seg-on"), pill: r("r-pill"), chip: r("r-chip"), check: r("r-check"), track: r("track-r") },
    border: { control: px("bw-control"), check: px("bw-check"), seg: px("seg-bw") },
    face: { display: face(tokens, "face-display"), sans: face(tokens, "face-sans"), qualifier: face(tokens, "face-qualifier"), control: face(tokens, "face-control") },
    weight: { display: Number(word("weight-display")), qualifier: Number(word("qualifier-weight")), control: Number(word("control-weight")) },
    tracking: { display: em(tokens, "tracking-display"), control: em(tokens, "control-tracking") },
    controlCase,
    qualifierItalic: word("qualifier-style") === "italic",
    glassBlur: word("glass-blur") !== "none",
    trackDotted: word("track-image") !== "none",
  };
}

// ---- Every look

export function buildLooks() {
  const globals = rules(readFileSync(join(repo, "src", "app", "globals.css"), "utf8"));
  // The light :root blocks (the first follows the @import and @source lines, so only its end is the selector).
  const skyLight = merged(globals, (s) => /(^|[;\s]):root$/.test(s));
  const skyDark = merged(globals, (s) => s === ':root[data-theme="dark"]');
  const dayparts = Object.fromEntries(DAY_PARTS.map((part) => [part, merged(globals, (s) => s === `:root[data-daypart="${part}"]`)]));

  const looks = {};
  const add = (id, light, dark) => {
    const lightTokens = { ...skyLight, ...light };
    const darkTokens = { ...skyLight, ...skyDark, ...light, ...dark };
    const lightShape = shape(lightTokens, `${id} light`);
    const darkShape = shape(darkTokens, `${id} dark`);
    if (JSON.stringify(lightShape) !== JSON.stringify(darkShape)) throw new Error(`${id}: its shape differs between light and dark, which the phone's table has no room for`);
    looks[id] = { light: theme(lightTokens, dayparts, `${id} light`), dark: theme(darkTokens, dayparts, `${id} dark`), shape: lightShape };
  };
  add("sky", {}, {});
  const dir = join(repo, "public", "looks");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".css")).sort()) {
    const id = file.replace(/\.css$/, "");
    const sheet = rules(readFileSync(join(dir, file), "utf8"));
    const light = merged(sheet, (s) => s === `:root[data-look="${id}"]`);
    const dark = merged(sheet, (s) => s === `:root[data-look="${id}"][data-theme="dark"]`);
    if (Object.keys(light).length === 0 || Object.keys(dark).length === 0) throw new Error(`${file}: no light or no dark block`);
    add(id, light, dark);
  }
  return looks;
}

export function render(looks) {
  const lines = [
    "// GENERATED by scripts/build-looks.mjs from the web's stylesheets (../../../../src/app/globals.css and",
    "// ../../../../public/looks/*.css). Do not edit: change the look on the web, then run `node scripts/build-looks.mjs`",
    "// in mobile/. generated.test.ts fails when this file is out of step.",
    'import type { LookTokens } from "./types";',
    "",
    "export const LOOK_TOKENS: Record<string, LookTokens> = {",
  ];
  for (const [id, look] of Object.entries(looks)) {
    lines.push(`  ${JSON.stringify(id)}: {`);
    for (const scheme of ["light", "dark"]) {
      lines.push(`    ${scheme}: {`, `      colours: ${JSON.stringify(look[scheme].colours)},`, `      shadows: ${JSON.stringify(look[scheme].shadows)},`, `      sky: ${JSON.stringify(look[scheme].sky)},`, "    },");
    }
    lines.push(`    shape: ${JSON.stringify(look.shape)},`, "  },");
  }
  lines.push("};", "");
  return lines.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = render(buildLooks());
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUT, "utf8");
    } catch {
      // No file yet: out of step.
    }
    if (current !== text) {
      console.error("src/ui/looks/generated.ts is out of step with the web's stylesheets. Run: node scripts/build-looks.mjs");
      process.exit(1);
    }
  } else {
    writeFileSync(OUT, text);
    console.log(`Wrote ${Object.keys(JSON.parse(JSON.stringify(buildLooks()))).length} looks to src/ui/looks/generated.ts`);
  }
}
