#!/usr/bin/env node
// The looks other than Sky and Daylight (DECISIONS.md, amendment 2026-10-20), defined once here.
//
//   node scripts/looks.mjs css    writes public/looks/<id>.css for every look below (committed; review the diff)
//   node scripts/looks.mjs fonts  copies each look's faces from its @fontsource package into public/fonts/
//                                 (ignored by git; runs before `npm run dev` and `npm run build`)
//
// A look is a palette per theme (24 colours, hex, so contrast.test.ts can hold its text to WCAG AA), its faces, its
// display weight and tracking, its corners, how the ribbon's spare track is drawn, and a few rules of its own. Sky's
// tokens in src/app/globals.css are the defaults every sheet redefines; Daylight's sheet is hand-written.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- Faces: one woff2 per variable family (Latin only), one per weight for the static ones. ----------
const v = (pkg, file, weight, extra = {}) => ({ pkg: `@fontsource-variable/${pkg}`, files: [{ file, weight }], ...extra });
const st = (pkg, weights) => ({ pkg: `@fontsource/${pkg}`, files: weights.map((w) => ({ file: `${pkg}-latin-${w}-normal.woff2`, weight: String(w) })) });
const FACES = {
  Archivo: v("archivo", "archivo-latin-standard-normal.woff2", "100 900", { stretch: "62% 125%" }),
  "Bricolage Grotesque": v("bricolage-grotesque", "bricolage-grotesque-latin-standard-normal.woff2", "200 800", { stretch: "75% 100%" }),
  Figtree: v("figtree", "figtree-latin-wght-normal.woff2", "300 900"),
  Syne: v("syne", "syne-latin-wght-normal.woff2", "400 800"),
  Manrope: v("manrope", "manrope-latin-wght-normal.woff2", "200 800"),
  Recursive: v("recursive", "recursive-latin-full-normal.woff2", "300 1000"),
  Unbounded: v("unbounded", "unbounded-latin-wght-normal.woff2", "200 900"),
  Onest: v("onest", "onest-latin-wght-normal.woff2", "100 900"),
  Doto: v("doto", "doto-latin-full-normal.woff2", "100 900"),
  "Barlow Semi Condensed": st("barlow-semi-condensed", [400, 500, 600, 700]),
  "Big Shoulders Display": v("big-shoulders-display", "big-shoulders-display-latin-wght-normal.woff2", "100 900"),
  Chivo: v("chivo", "chivo-latin-wght-normal.woff2", "100 900"),
  "Schibsted Grotesk": v("schibsted-grotesk", "schibsted-grotesk-latin-wght-normal.woff2", "400 900"),
  "Zen Kaku Gothic New": st("zen-kaku-gothic-new", [300, 400, 500, 700, 900]),
  "Roboto Flex": v("roboto-flex", "roboto-flex-latin-standard-normal.woff2", "100 1000", { stretch: "25% 151%" }),
  "JetBrains Mono": v("jetbrains-mono", "jetbrains-mono-latin-wght-normal.woff2", "100 800"),
  Jost: v("jost", "jost-latin-wght-normal.woff2", "100 900"),
  Rubik: v("rubik", "rubik-latin-wght-normal.woff2", "300 900"),
  Lexend: v("lexend", "lexend-latin-wght-normal.woff2", "100 900"),
  "Pixelify Sans": v("pixelify-sans", "pixelify-sans-latin-wght-normal.woff2", "400 700"),
  Karla: v("karla", "karla-latin-wght-normal.woff2", "200 800"),
  Sora: v("sora", "sora-latin-wght-normal.woff2", "100 800"),
  Gabarito: v("gabarito", "gabarito-latin-wght-normal.woff2", "400 900"),
  Michroma: st("michroma", [400]),
  "IBM Plex Mono": st("ibm-plex-mono", [400, 500, 600, 700]),
  Fredoka: v("fredoka", "fredoka-latin-standard-normal.woff2", "300 700", { stretch: "75% 125%" }),
  Syncopate: st("syncopate", [400, 700]),
  "Josefin Sans": v("josefin-sans", "josefin-sans-latin-wght-normal.woff2", "100 700"),
  "Big Shoulders Stencil Display": v("big-shoulders-stencil-display", "big-shoulders-stencil-display-latin-wght-normal.woff2", "100 900"),
  Saira: v("saira", "saira-latin-standard-normal.woff2", "100 900", { stretch: "50% 125%" }),
  Overpass: v("overpass", "overpass-latin-wght-normal.woff2", "100 900"),
  Caveat: v("caveat", "caveat-latin-wght-normal.woff2", "400 700"),
  "Hanken Grotesk": v("hanken-grotesk", "hanken-grotesk-latin-wght-normal.woff2", "100 900"),
};

// ---------- Palettes: 24 colours in this order, per theme. ----------
const ORDER = "paper surface surface-2 surface-3 line line-strong line-control ink ink-2 ink-3 ink-4 spare spare-fill spare-soft meet meet-fill meet-soft over over-fill over-soft deadline deadline-fill deadline-soft block-fill".split(" ");
const P = (s) => {
  const vals = s.trim().split(/\s+/);
  if (vals.length !== ORDER.length) throw new Error(`palette needs ${ORDER.length} colours, got ${vals.length}: ${s}`);
  return Object.fromEntries(ORDER.map((k, i) => [k, vals[i]]));
};

const SANS = "system-ui, -apple-system, \"Segoe UI\", sans-serif";
const MONO = "ui-monospace, \"SF Mono\", Menlo, monospace";
const face = (name, fallback = SANS) => `"${name}", ${fallback}`;
/** Corners: xs, sm, lg, xl, sheet, fab. */
const R = (xs, sm, lg, xl, sheet, fab) => ({ xs, sm, lg, xl, sheet, fab });
/** The ribbon's spare track drawn in segments, gaps in the card's colour. */
const SEGMENTS = (gap = "var(--glass)") => ({ image: `repeating-linear-gradient(to right, transparent 0 6px, ${gap} 6px 8px)`, r: "0" });
/** A page with a pattern behind everything; the sidebar lets it show. */
const PATTERN = (layers) => ({ backdrop: `${layers}, var(--paper)`, chrome: "transparent" });

const LOOKS = [
  {
    id: "timetable",
    name: "Timetable",
    faces: { display: face("Archivo"), qualifier: face("Archivo"), sans: face("Archivo") },
    weight: 850, tracking: "-0.01em", qualifierWeight: 800,
    radius: R("0", "2px", "4px", "4px", "8px", "4px"),
    track: { image: "repeating-linear-gradient(to right, transparent 0 calc(100% / 9 - 2px), var(--glass) calc(100% / 9 - 2px) calc(100% / 9))", r: "0" },
    light: P("#ffffff #f3f5f8 #e8ecf1 #ffffff #dfe3e8 #b9c0ca #6b7381 #0f141b #3d4552 #525a68 #7b8391 #7a5600 #ffc20e #fff3c4 #2453d6 #2f6bff #e3ebff #9a4a00 #ff7a1a #ffe7d4 #c01d33 #d7263d #ffe1e5 #0f141b"),
    dark: P("#0e1116 #171c24 #1f2530 #222a35 #2a313c #3c4553 #7d8696 #f2f4f7 #c0c7d2 #9aa3b0 #6f7887 #ffd24a #ffd24a #3a3110 #8fb0ff #5c8bff #1c2747 #ffae6b #ff8a3d #3a2414 #ff7b8a #ff5d6c #3d1d22 #c0c7d2"),
    extra: `$ .font-display-italic { text-transform: uppercase; letter-spacing: 0.08em; }
$ [data-glass] { border-top: 3px solid var(--ink); }`,
  },
  {
    id: "sunwise",
    name: "Sunwise",
    faces: { display: face("Bricolage Grotesque"), qualifier: face("Figtree"), sans: face("Figtree") },
    weight: 800, tracking: "-0.03em",
    radius: R("8px", "12px", "18px", "22px", "28px", "22px"),
    track: { image: "linear-gradient(90deg, #ffd25a, var(--spare-fill))" },
    light: P("#eef3fb #ffffff #f1f4fb #ffffff #dde3f0 #c3cbe0 #7b82a6 #1d2148 #4a5080 #565c88 #8a8fb3 #9a5b00 #f7b500 #fff1c7 #2f5fd0 #5b8cff #e4ecff #b04a1c #ff8a5b #ffe6dc #c62f35 #e5484d #ffe3e4 #3d4194"),
    dark: P("#141633 #1e2147 #262a56 #2a2e5c #2f3466 #434987 #8d92c4 #eef0ff #c3c7ec #a3a8d4 #7c81b0 #ffcf5c #ffc533 #3a3216 #9ab6ff #7aa2ff #232a5c #ffb08f #ff8f66 #3d2420 #ff8a8d #ff6b6f #3d1f26 #9da3e0"),
    extra: `$ [data-glass] { border-color: transparent; box-shadow: 0 10px 28px -16px rgb(29 33 72 / 0.4); }`,
  },
  {
    id: "studio",
    name: "Studio",
    faces: { display: face("Syne"), qualifier: face("Manrope"), sans: face("Manrope") },
    weight: 800, tracking: "-0.01em", qualifierWeight: 800,
    radius: R("6px", "8px", "12px", "12px", "18px", "14px"),
    track: { r: "8px" },
    light: P("#ffffff #ffffff #f2f2f2 #ffffff #111111 #111111 #111111 #111111 #3d3d3d #555555 #8a8a8a #0a7a4b #19d48a #d6f8e9 #2f55e0 #6b8cff #e4eaff #9a5800 #ffb020 #ffefcf #d0331a #ff4d2e #ffe3dd #111111"),
    dark: P("#121212 #1a1a1a #242424 #262626 #d9d9d9 #f5f5f5 #f5f5f5 #f5f5f5 #c9c9c9 #a8a8a8 #7a7a7a #19d48a #19d48a #0f3a28 #9cb3ff #7d9bff #1f2645 #ffc35c #ffb020 #3a2c10 #ff8a73 #ff6a4d #3d211c #f5f5f5"),
    extra: `$ { --shadow-2: 4px 4px 0 var(--ink); --shadow-fab: 3px 3px 0 var(--ink); }
$ [data-glass] { border-width: 2px; border-color: var(--ink); box-shadow: 4px 4px 0 var(--ink); }
$ .ribbon-track { box-shadow: inset 0 0 0 2px var(--ink); }`,
    extraDark: `$ { --shadow-2: 4px 4px 0 var(--spare-fill); --shadow-fab: 3px 3px 0 var(--spare-fill); }
$ [data-glass] { box-shadow: 4px 4px 0 var(--spare-fill); }`,
  },
  {
    id: "highlighter",
    name: "Highlighter",
    faces: { display: face("Recursive"), qualifier: face("Recursive"), sans: face("Recursive") },
    weight: 850, tracking: "-0.01em",
    radius: R("3px", "5px", "8px", "10px", "16px", "12px"),
    track: { r: "3px 7px 4px 8px" },
    ...PATTERN("radial-gradient(circle, var(--dot) 1px, transparent 1.3px) 0 0 / 14px 14px"),
    bar: "rgb(255 255 255 / 0.86)",
    light: P("#ffffff #ffffff #f2f4f8 #ffffff #cfdcf0 #9fb4d4 #3a3f4c #1b1e26 #474d5c #555b6b #8a90a0 #4a6b00 #dcf65a #f3fcc9 #1d5f99 #a8dbff #e3f3ff #9a5300 #ffc069 #fff0d6 #c9381f #e8462f #ffe2dc #1b1e26"),
    dark: P("#15171c #1b1e25 #232731 #262b36 #2c3442 #3e4859 #8d93a0 #eef0f4 #b8bdc8 #9ba1ae #6f7583 #c8ee3a #c8ee3a #2c3410 #8fd0ff #6fc1ff #16293a #ffc98a #ffb054 #3a2a14 #ff8a76 #ff6a52 #3d221c #b8bdc8"),
    vars: { dot: "#d5dbe6" },
    darkVars: { dot: "#2a2f3a", bar: "rgb(21 23 28 / 0.86)" },
    extra: `$ .font-display { font-variation-settings: "CASL" 1; }
$ .num, $ time { font-variation-settings: "MONO" 1; }
$ [data-glass] { border: 1.5px solid var(--ink); border-radius: 4px 9px 5px 10px; }`,
  },
  {
    id: "dusk",
    name: "Dusk",
    faces: { display: face("Unbounded"), qualifier: face("Onest"), sans: face("Onest") },
    weight: 600, tracking: "-0.01em",
    radius: R("8px", "12px", "16px", "18px", "26px", "20px"),
    track: {},
    light: P("#faf5ff #ffffff #f4ecfa #ffffff #eadff3 #d3c3e2 #8a789e #2a1636 #5d4a6b #6a5878 #9d8db0 #0b7a68 #19b39a #d3f5ee #5b44d6 #9b85ff #ece7ff #9a5200 #f0a040 #ffefd9 #c22f57 #e5486e #ffe2ea #2a1636"),
    dark: P("#1d1024 #2a1a33 #34213f #382545 #3d2a47 #56405f #a48bb0 #fbeefa #cdb7d6 #b39dbe #8a7596 #6ff0d6 #4fe0c4 #163a35 #c3b4ff #b7a4ff #2e2350 #ffc27a #f0a040 #3d2a16 #ff8fa8 #ff7a98 #42202c #cdb7d6"),
    extra: `$ .ribbon-track { box-shadow: 0 0 14px color-mix(in oklab, var(--spare-fill) 45%, transparent); }
$ [data-glass] { background-image: linear-gradient(160deg, transparent, color-mix(in oklab, var(--spare-fill) 12%, transparent)); }`,
  },
  {
    id: "casio",
    name: "Casio",
    faces: { display: face("Doto", MONO), qualifier: face("Barlow Semi Condensed"), sans: face("Barlow Semi Condensed") },
    weight: 900, tracking: "0.02em", qualifierWeight: 700,
    radius: R("2px", "4px", "8px", "10px", "16px", "18px"),
    track: SEGMENTS(),
    glass: "#c6d2b0",
    light: P("#e7e9e2 #f3f4ef #e0e3d9 #ffffff #c4c9bc #a3a99a #5e6656 #1a1f16 #3f4738 #4e5745 #7b8270 #24400f #2b3a20 #d5dcc8 #a63f00 #ff6a1a #ffe4d4 #8a5a00 #d99a2b #f6ead0 #b8320f #e8461f #fde0d8 #2b2f27"),
    dark: P("#151714 #1d201b #262a23 #2a2e27 #2f342b #444a3e #8a917e #e6eadf #b3b9a8 #9aa18d #6f7664 #bff0ff #7fdcff #0f2a33 #ffa36b #ff6a1a #3d2214 #f0c16a #d99a2b #3a2e14 #ff8a66 #ff7a4d #3d2219 #b3b9a8"),
    darkVars: { glass: "#0f2a33" },
    extra: `$ [data-glass] { border: 3px solid #2b2f27; box-shadow: inset 0 2px 0 rgb(0 0 0 / 0.14); }
$ .font-display-italic { text-transform: uppercase; letter-spacing: 0.12em; }`,
    extraDark: `$ [data-glass] { border-color: #0a1a20; }`,
  },
  {
    id: "pulse",
    name: "Pulse",
    faces: { display: face("Big Shoulders Display"), qualifier: face("Chivo"), sans: face("Chivo") },
    weight: 900, tracking: "0", qualifierWeight: 800,
    radius: R("6px", "10px", "14px", "16px", "24px", "999px"),
    track: {},
    light: P("#f3f4f6 #ffffff #eceef2 #ffffff #e2e4e9 #c4c8d0 #6c707a #0a0b0d #44474f #565a63 #8b8f99 #1f55e0 #2f6bff #e2eaff #b1166a #ff4f9a #ffe1ef #9a5200 #ff9a1f #ffeccf #cc2d1d #ff4433 #ffe1dd #0a0b0d"),
    dark: P("#0b0c0f #17191e #20232a #23262e #262a31 #3a3f49 #8b909c #f4f5f7 #b9bdc7 #9a9fab #6c717d #7aa0ff #4d82ff #172243 #ff8cc0 #ff64a8 #3d1a2c #ffbc66 #ff9a1f #3a2a12 #ff8576 #ff5a47 #3d1f1b #b9bdc7"),
    extra: `$ .font-display-italic { text-transform: uppercase; font-style: italic; letter-spacing: 0.06em; }
$ h1 { text-transform: uppercase; }`,
  },
  {
    id: "color-field",
    name: "Color Field",
    faces: { display: face("Schibsted Grotesk"), qualifier: face("Schibsted Grotesk"), sans: face("Schibsted Grotesk") },
    weight: 900, tracking: "-0.04em", qualifierWeight: 800,
    radius: R("6px", "10px", "14px", "14px", "22px", "999px"),
    track: { color: "#ffffff" },
    glass: "transparent",
    light: P("#ffd84d #ffffff #f6f3e6 #ffffff #e0bd3a #111111 #111111 #111111 #3a3524 #5a5236 #7a704d #2440d8 #3d5afe #e3e8ff #a3104a #ff4f9a #ffe1ef #8a4b00 #ff8a1f #ffeedb #a8140a #ff3b2e #ffe3e0 #111111"),
    dark: P("#141414 #222222 #2a2a2a #2e2e2e #333333 #4a4a4a #9a9a9a #f2f2f2 #c2c2c2 #a6a6a6 #757575 #ffd84d #ffd84d #3a3210 #ff8cc0 #ff4f9a #3d1a2c #ffb062 #ff8a1f #3a2614 #ff8a80 #ff5a4d #3d1f1d #c2c2c2"),
    darkVars: { glass: "#ffd84d" },
    extraLight: `$ [data-view] { background: var(--paper); }
$ [data-view="inbox"] { --paper: #b9d0ff; }
$ [data-view="upcoming"], $ [data-view="calendar"] { --paper: #bff0c8; }
$ [data-view="someday"], $ [data-view="logbook"] { --paper: #ffd0e0; }
$ [data-view="settings"], $ [data-view="search"] { --paper: #e8e2ff; }
$ [data-view="project"], $ [data-view="area"], $ [data-view="browse"] { --paper: #ffe0c2; }`,
    extraDark: `$ [data-glass] { --ink: #111111; --ink-2: #3a3524; --ink-3: #5a5236; --ink-4: #7a704d; --line: #e0bd3a; --line-strong: #111111; --line-control: #111111; --spare: #2440d8; --spare-fill: #3d5afe; --hatch: rgb(17 17 17 / 0.16); --surface: #ffd84d; --glass: #ffd84d; color: #111111; border-color: #111111; }`,
  },
  {
    id: "indigo",
    name: "Indigo",
    faces: { display: face("Zen Kaku Gothic New"), qualifier: face("Zen Kaku Gothic New"), sans: face("Zen Kaku Gothic New") },
    weight: 300, tracking: "0.01em", qualifierWeight: 500,
    radius: R("2px", "3px", "4px", "6px", "12px", "999px"),
    track: {},
    light: P("#f7f8fa #ffffff #f0f2f6 #ffffff #e3e7ed #c7ced8 #6f7a8c #1b2433 #4d596b #59657a #8e98a8 #264d73 #264d73 #e3ebf4 #8a6420 #c09a4a #f6eedc #8a5300 #d9902b #fbefd9 #b0352a #c0392b #fae2df #1b2433"),
    dark: P("#0f1622 #162030 #1d2a3d #213046 #24324a #34466a #8693a6 #e9eef5 #b3bfcf #97a4b8 #6c7a8f #9dbde6 #86acdc #1a2b44 #e0c27e #d8b46a #33291a #ffc57d #e9a548 #3a2c16 #ff8f82 #ff7466 #3d221f #b3bfcf"),
    extra: `$ .font-display-italic { letter-spacing: 0.12em; }
$ [data-glass] { border-color: transparent; background-color: transparent; }`,
  },
  {
    id: "material",
    name: "Material",
    faces: { display: face("Roboto Flex"), qualifier: face("Roboto Flex"), sans: face("Roboto Flex") },
    weight: 450, tracking: "-0.01em", qualifierWeight: 600,
    radius: R("8px", "12px", "16px", "28px", "28px", "16px"),
    track: {},
    light: P("#f6fbf3 #ecf3e8 #e1eadd #ffffff #c2c9bd #a6ae9f #72796f #191d18 #424940 #4d554a #7b8377 #1b6c3d #3a9a5c #a3f5b7 #3a6ea5 #5b8fd0 #d4e3ff #7a5900 #c9952b #ffdea1 #ba1a1a #d84545 #ffdad6 #191d18"),
    dark: P("#10140f #1c211b #262b25 #31362f #424940 #59615a #8c9388 #e0e4dc #c2c9bd #a8b0a3 #7d8579 #88d99c #6fc488 #00522a #a3c9ff #7fb0f0 #1d3550 #f0c06a #d9a54a #3d2f12 #ffb4ab #ff897d #4a1d19 #c2c9bd"),
    extra: `$ [data-glass] { border-color: transparent; }`,
  },
  {
    id: "terminal",
    name: "Terminal",
    darkOnly: true,
    faces: { display: face("JetBrains Mono", MONO), qualifier: face("JetBrains Mono", MONO), sans: face("JetBrains Mono", MONO) },
    weight: 800, tracking: "-0.02em", qualifierWeight: 500,
    radius: R("2px", "3px", "4px", "4px", "6px", "4px"),
    track: SEGMENTS(),
    light: P("#17181c #1f2026 #26272e #2a2b33 #2c2d33 #3f4048 #7d7e84 #e6e6e6 #a9a9ad #9a9aa0 #6c6d73 #ffb000 #ffb000 #3a2c0c #6ec1ff #4aa8f0 #13293a #ff9a5c #ff7a33 #3a2214 #ff6f66 #ff5f56 #3d1d1c #a9a9ad"),
    dark: P("#17181c #1f2026 #26272e #2a2b33 #2c2d33 #3f4048 #7d7e84 #e6e6e6 #a9a9ad #9a9aa0 #6c6d73 #ffb000 #ffb000 #3a2c0c #6ec1ff #4aa8f0 #13293a #ff9a5c #ff7a33 #3a2214 #ff6f66 #ff5f56 #3d1d1c #a9a9ad"),
  },
  {
    id: "bauhaus",
    name: "Bauhaus",
    faces: { display: face("Jost"), qualifier: face("Jost"), sans: face("Jost") },
    weight: 700, tracking: "-0.03em", qualifierWeight: 600,
    radius: R("0", "0", "0", "0", "0", "999px"),
    track: { r: "0" },
    light: P("#ffffff #f2f3f5 #e8eaee #ffffff #d9dce2 #111111 #111111 #111111 #3b3b3b #555555 #8a8a8a #1f4bd8 #1f4bd8 #e1e8fb #7a5d00 #f5c400 #fff4c2 #a04d00 #ff8c1a #ffead6 #c4210f #e3341c #ffe1dc #111111"),
    dark: P("#121212 #1d1d1f #26262a #2a2a2e #333336 #f2f2f2 #f2f2f2 #f2f2f2 #c4c4c4 #a6a6a6 #757575 #8aa6ff #4f78ff #1b2547 #ffd21a #ffd21a #3a3210 #ffb062 #ff8c1a #3a2614 #ff7a61 #ff5a3d #3d1f1a #f2f2f2"),
    extra: `$ h1, $ .font-display-italic { text-transform: lowercase; }`,
  },
  {
    id: "riso",
    name: "Riso",
    faces: { display: face("Rubik"), qualifier: face("Rubik"), sans: face("Rubik") },
    weight: 900, tracking: "-0.02em", qualifierWeight: 800,
    radius: R("4px", "6px", "8px", "10px", "16px", "12px"),
    track: {},
    ...PATTERN("radial-gradient(var(--grain) 0.6px, transparent 0.7px) 0 0 / 3px 3px"),
    light: P("#fbfbfa #ffffff #f6f3f8 #ffffff #f3b6d4 #1d2a8a #1d2a8a #1d2a8a #3c4aa6 #4a57ad #8a92c9 #c8106f #ff4fa3 #ffe0ef #1f4fe6 #2a5cff #e1e8ff #8a4b00 #ff9e3d #ffeedb #b3261e #e8452f #ffe2dc #1d2a8a"),
    dark: P("#14152a #1b1d36 #23264a #272a50 #5a3060 #c9d2ff #a3aee8 #c9d2ff #a3aee8 #95a0de #6b74a8 #ff8cc6 #ff6fb6 #3d1a33 #9db3ff #7d9bff #1f2550 #ffbe7a #ff9e3d #3a2a16 #ff8f80 #ff6a52 #3d201c #c9d2ff"),
    vars: { grain: "rgb(29 42 138 / 0.07)" },
    darkVars: { grain: "rgb(201 210 255 / 0.06)" },
    extra: `$ .font-display { text-shadow: 1.5px 1px 0 color-mix(in oklab, var(--spare-fill) 70%, transparent); }
$ [data-glass] { border: 2px solid var(--ink); }`,
  },
  {
    id: "tide",
    name: "Tide",
    faces: { display: face("Lexend"), qualifier: face("Lexend"), sans: face("Lexend") },
    weight: 600, tracking: "-0.03em", qualifierWeight: 500,
    radius: R("8px", "12px", "18px", "22px", "28px", "22px"),
    track: { color: "var(--spare-soft)", image: "radial-gradient(circle at 8px 160%, var(--spare-fill) 66%, transparent 68%)", size: "16px 100%", r: "6px" },
    light: P("#eef6fa #ffffff #e9f3f8 #ffffff #d6e6ee #b5cdd9 #6a8594 #0b2a3a #3d5a6a #4a6676 #8aa2ae #0f62bd #1475e1 #ddeeff #8a5d10 #e2b86b #f8eedb #8a5000 #e0952e #fcecd4 #c13d33 #e2574c #fde2df #0b2a3a"),
    dark: P("#061a26 #0b2636 #102e42 #133449 #173a4d #285468 #7d9cab #e3f3fa #a9c6d4 #93b2c1 #658493 #7cc0ff #3aa0ff #0e2c47 #f0d08f #e6c27a #33291a #ffc27a #f0a040 #3a2a14 #ff9a90 #ff7b70 #3d2120 #a9c6d4"),
    extra: `$ [data-glass] { border-color: transparent; box-shadow: 0 8px 24px -16px rgb(11 42 58 / 0.4); }`,
  },
  {
    id: "quest",
    name: "Quest",
    faces: { display: face("Pixelify Sans", MONO), qualifier: face("Pixelify Sans", MONO), sans: face("Karla") },
    weight: 700, tracking: "0",
    radius: R("0", "0", "0", "0", "0", "0"),
    track: SEGMENTS(),
    light: P("#eef1ff #ffffff #f1f3ff #ffffff #d7dbf5 #1b1d3a #1b1d3a #1b1d3a #4a4e7a #555a88 #8d91bb #1d5fd8 #3b82f6 #dfeaff #8a5600 #f59e0b #fff0cc #a1440f #f97316 #ffe7d6 #c62828 #ef4444 #ffe2e2 #1b1d3a"),
    dark: P("#12132a #1c1e3d #24274d #282b55 #2c2f5a #eef0ff #b9bde3 #eef0ff #b9bde3 #a1a6d2 #6f74a3 #93c5fd #60a5fa #172a4a #fcd34d #fbbf24 #3a2f10 #fdba74 #fb923c #3a2414 #fca5a5 #f87171 #3d1f22 #b9bde3"),
    extra: `$ { --shadow-2: 4px 4px 0 var(--ink); --shadow-fab: 3px 3px 0 var(--ink); }
$ [data-glass] { border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); }
$ .ribbon-track { box-shadow: 0 0 0 2px var(--ink); }`,
    extraDark: `$ { --shadow-2: 4px 4px 0 #000; --shadow-fab: 3px 3px 0 #000; }
$ [data-glass] { box-shadow: 4px 4px 0 #000; }`,
  },
  {
    id: "sundial",
    name: "Sundial",
    faces: { display: face("Sora"), qualifier: face("Sora"), sans: face("Sora") },
    weight: 700, tracking: "-0.03em", qualifierWeight: 600,
    radius: R("8px", "12px", "18px", "24px", "28px", "24px"),
    track: { image: "linear-gradient(90deg, #ffc061, var(--spare-fill))" },
    light: P("#f5f7fb #ffffff #eef1f7 #ffffff #e2e7f0 #c3ccdb #707b94 #14213d #44506b #4f5b76 #8892a8 #a35a00 #ffa630 #fff0d9 #3354d6 #4f7cff #e3eaff #9b4400 #f97a1f #ffe7d4 #c42f35 #e5484d #ffe2e4 #14213d"),
    dark: P("#0d1424 #141e33 #1b2742 #1f2c4a #24304a #374668 #8693ad #eaf0ff #b5c0d9 #9ba7c2 #6c7896 #ffc670 #ffb547 #3a2c14 #9db3ff #7d9bff #1c2647 #ffb280 #ff8f4d #3a2416 #ff8f8f #ff6b6f #3d1f24 #b5c0d9"),
    extra: `$ [data-glass] { border-color: transparent; box-shadow: 0 8px 24px -16px rgb(20 33 61 / 0.35); }`,
  },
  {
    id: "garden",
    name: "Garden",
    faces: { display: face("Gabarito"), qualifier: face("Gabarito"), sans: face("Gabarito") },
    weight: 800, tracking: "-0.02em",
    radius: R("10px", "14px", "22px", "28px", "32px", "24px"),
    track: {},
    light: P("#fdf7f9 #ffffff #f8eff3 #ffffff #eadfe3 #d2c1c8 #7a8574 #23301f #4f5c4a #56634f #8d988a #2e7d32 #4caf50 #dcf3dd #ad2f68 #f48fb1 #fde4ee #8a5a00 #e0a030 #fbefd5 #c0392b #d84343 #fde2df #23301f"),
    dark: P("#121a14 #1a241c #212d23 #253228 #2a362b #3d4d3e #8d9b8c #eaf3ea #b9c7b8 #a0afa0 #738272 #97dd9e #74c97c #1d3520 #f8a5c2 #f48fb1 #3d2030 #f0c56a #e0a030 #3a2e12 #ff8f82 #ff6f60 #3d211f #b9c7b8"),
    extra: `$ [data-glass] { border-radius: 38px 26px 40px 24px / 30px 40px 26px 38px; border-color: transparent; box-shadow: 0 12px 26px -18px rgb(35 48 31 / 0.45); }`,
  },
  {
    id: "chrome",
    name: "Chrome",
    faces: { display: face("Michroma"), qualifier: face("Manrope"), sans: face("Manrope") },
    weight: 400, tracking: "0.02em", qualifierWeight: 800,
    radius: R("999px", "10px", "14px", "18px", "24px", "999px"),
    track: { image: "linear-gradient(90deg, #7af5ff, #c79bff, #ff9bd2, #ffe48a)" },
    glassImage: "linear-gradient(180deg, rgb(255 255 255 / 0.9), rgb(210 214 222 / 0.55))",
    light: P("#e9ebef #f7f8fa #e6e9ee #ffffff #c9ced8 #a8aeba #6b7180 #1a1d24 #4a4f5c #525866 #868c99 #6b3fd8 #c79bff #efe4ff #3546d8 #4a5cff #e2e6ff #8a4f00 #e8a33a #fbecd4 #c0332f #e5484d #ffe2e2 #1a1d24"),
    dark: P("#0d0f14 #1a1d24 #22262e #2a2e38 #2f343e #454b57 #8a909c #eef1f6 #b8bec9 #9ea4b0 #6f7581 #c9a8ff #b48bff #2a1f45 #9aa8ff #7d8cff #1f2550 #f0c27a #e8a33a #3a2c14 #ff8f8f #ff6b6b #3d1f22 #b8bec9"),
    darkVars: { "glass-image": "linear-gradient(180deg, rgb(255 255 255 / 0.09), rgb(255 255 255 / 0))" },
    extra: `$ [data-glass] { box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.7), 0 8px 18px -12px rgb(0 0 0 / 0.35); }`,
  },
  {
    id: "blueprint",
    name: "Blueprint",
    darkOnly: true,
    faces: { display: face("IBM Plex Mono", MONO), qualifier: face("IBM Plex Mono", MONO), sans: face("IBM Plex Mono", MONO) },
    weight: 700, tracking: "0", qualifierWeight: 500,
    radius: R("0", "0", "0", "0", "0", "0"),
    track: { color: "rgb(255 209 102 / 0.28)", r: "0" },
    glass: "transparent",
    ...PATTERN("linear-gradient(var(--grid) 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(90deg, var(--grid) 1px, transparent 1px) 0 0 / 14px 14px"),
    light: P("#0f3d6e #134a82 #17558f #1a5c9a #4a78a8 #9cc3ea #cfe3f7 #eaf4ff #c4dcf3 #b0cdea #7fa6cc #ffd166 #ffd166 #24527e #a8e0ff #7cc8ff #1d5a8c #ffb38a #ff9a66 #4a3a52 #ffa08a #ff7a5c #4a2f45 #eaf4ff"),
    dark: P("#082a4c #0d3a66 #114675 #134d80 #3d6a96 #9cc3ea #cfe3f7 #eaf4ff #c4dcf3 #b0cdea #7fa6cc #ffd166 #ffd166 #1d4a73 #a8e0ff #7cc8ff #164e80 #ffb38a #ff9a66 #40324a #ffa08a #ff7a5c #42293f #eaf4ff"),
    vars: { grid: "rgb(255 255 255 / 0.08)" },
    extra: `$ [data-glass] { border: 1px solid var(--ink); }
$ .ribbon-track { box-shadow: inset 0 0 0 1px var(--ink); }
$ h1 { text-transform: uppercase; letter-spacing: 0.04em; }`,
  },
  {
    id: "sticker",
    name: "Sticker",
    faces: { display: face("Fredoka"), qualifier: face("Fredoka"), sans: face("Fredoka") },
    weight: 600, tracking: "0", qualifierWeight: 600,
    radius: R("999px", "14px", "20px", "22px", "28px", "999px"),
    track: {},
    light: P("#fff2fa #ffffff #fdf0f7 #ffffff #f5dcec #e6bfd6 #927fa1 #3b2a4a #6a5679 #6e5a82 #a593b3 #187a53 #7ee0b5 #e3f9ef #4f5fd6 #a0b8ff #e8edff #a3520a #ffb36b #fff0de #d12f5a #ff5c84 #ffe2ea #3b2a4a"),
    dark: P("#22182d #2f2440 #382c4b #3d3052 #43345a #5c4a75 #ae98bd #fff0fb #d9c4e6 #c2acd2 #8f7aa3 #8ef0c4 #7ee0b5 #1f3a33 #b9c7ff #a0b8ff #2c2c55 #ffc58f #ffb36b #3d2c20 #ff8fab #ff5c84 #42202e #d9c4e6"),
    vars: { outline: "#ffffff" },
    darkVars: { outline: "#3e3152" },
    extra: `$ [data-glass] { border: 4px solid var(--outline); box-shadow: 0 5px 0 rgb(59 42 74 / 0.14); transform: rotate(-0.6deg); }
$ .ribbon-track { box-shadow: 0 0 0 3px var(--outline); }`,
  },
  {
    id: "noir",
    name: "Noir",
    faces: { display: face("Josefin Sans"), qualifier: face("Syncopate"), sans: face("Josefin Sans") },
    weight: 200, tracking: "-0.02em", qualifierWeight: 700,
    radius: R("2px", "2px", "2px", "2px", "6px", "2px"),
    track: { r: "0" },
    glass: "transparent",
    light: P("#ffffff #f7f7f7 #efefef #ffffff #e2e0da #c9c5bb #6e6a60 #141414 #4a4740 #5a564d #8f8a80 #7a5c22 #c9a96e #f5ecdb #3d556e #8fa3b8 #e6ecf2 #8a5200 #c98a3a #f7ead6 #a83b2e #c9564a #f8e1de #141414"),
    dark: P("#0b0b0c #141416 #1c1c1f #222225 #2a2826 #3e3b37 #8a8475 #f3efe6 #bdb6a6 #a39c8c #6f695c #d8bb84 #c9a96e #2e2618 #b3c4d6 #8fa3b8 #1d242c #e8b878 #c98a3a #33271a #e8978b #e07a6a #3a211e #bdb6a6"),
    extra: `$ .font-display-italic { text-transform: uppercase; letter-spacing: 0.3em; font-size: 0.5em; }
$ [data-glass] { border-width: 1px 0; border-color: var(--spare-fill); border-radius: 0; }`,
  },
  {
    id: "workshop",
    name: "Workshop",
    faces: { display: face("Big Shoulders Stencil Display"), qualifier: face("Saira"), sans: face("Saira") },
    weight: 900, tracking: "0.01em", qualifierWeight: 800,
    radius: R("2px", "2px", "4px", "4px", "6px", "4px"),
    track: { r: "0" },
    light: P("#f2f2ef #ffffff #ebebe6 #ffffff #d6d6d0 #121212 #121212 #121212 #3d3d3d #4f4f4f #858580 #6b5300 #ffcc00 #fff4c2 #155fa8 #1e88e5 #dceeff #9a4a00 #ff8a1a #ffead6 #c62828 #e53935 #ffe1e0 #121212"),
    dark: P("#141414 #1d1d1d #262626 #2a2a2a #333333 #f2f2f2 #c4c4c4 #f2f2f2 #c4c4c4 #a8a8a8 #757575 #ffd633 #ffcc00 #3a3210 #7ab8ff #4aa3ff #16283d #ffb062 #ff8a1a #3a2614 #ff8a85 #ff5f5a #3d1f1f #c4c4c4"),
    extra: `$ h1 { text-transform: uppercase; }
$ .font-display-italic { text-transform: uppercase; letter-spacing: 0.1em; }
$ [data-glass] { border: 2px solid var(--ink); border-top: 10px solid transparent; border-image: repeating-linear-gradient(-45deg, var(--spare-fill) 0 8px, var(--ink) 8px 16px) 10 0 0 0 / 10px 0 0 0; }`,
  },
  {
    id: "metro",
    name: "Metro",
    faces: { display: face("Overpass"), qualifier: face("Overpass"), sans: face("Overpass") },
    weight: 800, tracking: "-0.02em", qualifierWeight: 700,
    radius: R("999px", "8px", "10px", "12px", "18px", "999px"),
    track: { image: "radial-gradient(circle at 50% 50%, var(--glass) 0 2.5px, transparent 3px)", size: "calc(100% / 9) 100%", pos: "calc(100% / -18) 0" },
    light: P("#ffffff #f4f5f7 #e9ecf0 #ffffff #dde1e6 #b8bfc8 #6b7682 #101820 #3f4a55 #4e5965 #87919c #0062b3 #0072ce #dcecfb #7a5600 #ffb81c #fff1cf #9a4d00 #ff8200 #ffeacf #b8221a #da291c #fde1df #101820"),
    dark: P("#0e1217 #161b22 #1d232b #222934 #26303b #3a4654 #87919c #f0f3f6 #b5bec8 #9aa4af #6b7580 #79b8ff #3a9bff #11263d #ffd06b #ffb81c #3a2e10 #ffb066 #ff9a33 #3a2614 #ff8a80 #ff5a4d #3d1f1d #b5bec8"),
  },
  {
    id: "scrapbook",
    name: "Scrapbook",
    faces: { display: face("Caveat", "cursive"), qualifier: face("Caveat", "cursive"), sans: face("Karla") },
    weight: 700, tracking: "0",
    radius: R("3px", "4px", "6px", "8px", "12px", "10px"),
    track: { r: "2px" },
    light: P("#eef1f4 #ffffff #f3f5f8 #ffffff #d9dde3 #b9bfc8 #6f7682 #2b2f36 #555b66 #5c6370 #8f95a0 #6e5a00 #ffe873 #fff8d1 #2b6aa8 #8ec9ff #e1f1ff #9a4f00 #ffb066 #ffeedb #c4302a #e5484d #ffe2e2 #2b2f36"),
    dark: P("#1c1f24 #2a2e35 #31363e #353a43 #353a42 #4a515b #969ba4 #f1f2f4 #c3c7ce #a9aeb7 #767c86 #ffe873 #ffe873 #3a3518 #9fd0ff #7ab8f0 #1a2b3d #ffc085 #ffa04d #3a2a18 #ff8f8a #ff6b66 #3d2020 #c3c7ce"),
    extra: `$ [data-glass] { position: relative; border-color: transparent; transform: rotate(-0.6deg); box-shadow: 0 6px 14px -8px rgb(0 0 0 / 0.35); }
$ [data-glass]::before { content: ""; position: absolute; top: -9px; left: 42%; width: 64px; height: 18px; background: rgb(240 214 160 / 0.75); transform: rotate(-3deg); pointer-events: none; }`,
  },
  {
    id: "zero",
    name: "Zero",
    faces: { display: face("Hanken Grotesk"), qualifier: face("Hanken Grotesk"), sans: face("Hanken Grotesk") },
    weight: 900, tracking: "-0.05em", qualifierWeight: 500,
    radius: R("0", "0", "0", "0", "0", "0"),
    track: { r: "0" },
    glass: "transparent",
    light: P("#ffffff #ffffff #f2f2f2 #ffffff #e6e6e6 #000000 #000000 #000000 #333333 #595959 #8c8c8c #000000 #000000 #ebebeb #555555 #9a9a9a #f0f0f0 #8a4300 #ff8a3d #fff0e6 #c23d00 #ff5c00 #ffe9de #000000"),
    dark: P("#000000 #0a0a0a #161616 #1c1c1c #262626 #ffffff #ffffff #ffffff #cccccc #a6a6a6 #737373 #ffffff #ffffff #1f1f1f #b3b3b3 #666666 #1a1a1a #ffb27a #ff8a3d #3a2414 #ff8a4d #ff5c00 #3d1f0f #cccccc"),
    extra: `$ [data-glass] { border-color: transparent; }
$ .font-display-italic { text-transform: lowercase; }`,
  },
];

// ---------- Writing the sheets ----------
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");

function palette(p, dark) {
  const ink = rgb(p.ink);
  const lines = Object.entries(p).map(([k, val]) => `  --${k}: ${val};`);
  lines.push(
    `  --hover: rgb(${ink} / ${dark ? 0.07 : 0.05});`,
    `  --press: rgb(${ink} / ${dark ? 0.11 : 0.08});`,
    `  --scrim: ${dark ? "rgb(0 0 0 / 0.55)" : `rgb(${ink} / 0.32)`};`,
    `  --hatch: rgb(${ink} / 0.16);`,
    `  --raised-border: ${dark ? "var(--line-strong)" : "transparent"};`,
    ...["spare", "meet", "over", "deadline"].map((r) => `  --${r}-line: color-mix(in oklab, var(--${r}-fill) 50%, var(--surface));`),
    `  --block-soft: var(--surface-2);`,
  );
  if (!dark) lines.push(`  --shadow-tint: ${ink};`);
  return lines;
}

const kv = (obj = {}) => Object.entries(obj).map(([k, val]) => `  --${k}: ${val};`);

function sheet(look) {
  const sel = `:root[data-look="${look.id}"]`;
  const out = [];
  out.push(`/* ${look.name} (DECISIONS.md, amendment 2026-10-20). Generated by scripts/looks.mjs; edit the look there and run\n   \`npm run looks css\`. Loaded only when chosen (features/looks/look.ts); redefines Sky's names from globals.css. */`);
  // Faces
  const names = new Set(Object.values(look.faces).map((f) => f.match(/^"([^"]+)"/)[1]));
  for (const name of names) {
    const f = FACES[name];
    if (!f) throw new Error(`${look.id}: no face "${name}"`);
    for (const file of f.files) {
      out.push(`@font-face {\n  font-family: "${name}";\n  src: url("/fonts/${file.file}") format("woff2");\n  font-weight: ${file.weight};${f.stretch ? `\n  font-stretch: ${f.stretch};` : ""}\n  font-style: normal;\n  font-display: swap;\n}`);
    }
  }
  const t = look.track ?? {};
  const shared = [
    `  --face-display: ${look.faces.display};`,
    `  --face-qualifier: ${look.faces.qualifier};`,
    `  --face-sans: ${look.faces.sans};`,
    `  --qualifier-style: normal;`,
    `  --qualifier-weight: ${look.qualifierWeight ?? 700};`,
    `  --weight-display: ${look.weight};`,
    `  --tracking-display: ${look.tracking};`,
    ...Object.entries(look.radius).map(([k, val]) => `  --r-${k}: ${val};`),
    `  --track: ${t.color ?? "var(--spare-fill)"};`,
    `  --track-image: ${t.image ?? "none"};`,
    `  --track-size: ${t.size ?? "auto"};`,
    `  --track-pos: ${t.pos ?? "0 0"};`,
    `  --track-r: ${t.r ?? "999px"};`,
    `  --elapsed: color-mix(in oklab, var(--surface) 60%, transparent);`,
    `  --daylight: none;`,
    `  --backdrop: ${look.backdrop ?? "none"};`,
    `  --glass: ${look.glass ?? "var(--surface)"};`,
    `  --glass-image: ${look.glassImage ?? "none"};`,
    `  --glass-blur: none;`,
    `  --bar: ${look.bar ?? "var(--paper)"};`,
    `  --chrome: ${look.chrome ?? "var(--paper)"};`,
  ];
  out.push(`${sel} {\n  color-scheme: ${look.darkOnly ? "dark" : "light"};\n${[...palette(look.light, Boolean(look.darkOnly)), ...shared, ...kv(look.vars)].join("\n")}\n}`);
  const darkBody = [...palette(look.dark, true), ...kv(look.darkVars)].join("\n");
  out.push(`@media (prefers-color-scheme: dark) {\n  ${sel}:not([data-theme="light"]) {\n    color-scheme: dark;\n${darkBody.replace(/^/gm, "  ")}\n  }\n}`);
  out.push(`${sel}[data-theme="dark"] {\n  color-scheme: dark;\n${darkBody}\n}`);
  if (look.extra) out.push(look.extra.replaceAll("$", sel));
  if (look.extraDark) {
    out.push(`@media (prefers-color-scheme: dark) {\n${look.extraDark.replaceAll("$", `${sel}:not([data-theme="light"])`).replace(/^/gm, "  ")}\n}`);
    out.push(look.extraDark.replaceAll("$", `${sel}[data-theme="dark"]`));
  }
  if (look.extraLight) {
    out.push(`@media (prefers-color-scheme: light) {\n${look.extraLight.replaceAll("$", `${sel}:not([data-theme="dark"])`).replace(/^/gm, "  ")}\n}`);
    out.push(look.extraLight.replaceAll("$", `${sel}[data-theme="light"]`));
  }
  return `${out.join("\n\n")}\n`;
}

function writeCss() {
  const dir = join(ROOT, "public/looks");
  mkdirSync(dir, { recursive: true });
  for (const look of LOOKS) writeFileSync(join(dir, `${look.id}.css`), sheet(look));
  console.log(`looks: wrote ${LOOKS.length} sheets to public/looks/`);
}

function copyFonts() {
  const dir = join(ROOT, "public/fonts");
  mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const f of Object.values(FACES)) {
    for (const file of f.files) {
      const from = join(ROOT, "node_modules", f.pkg, "files", file.file);
      if (!existsSync(from)) throw new Error(`looks: missing ${from} (npm install?)`);
      copyFileSync(from, join(dir, file.file));
      n++;
    }
  }
  console.log(`looks: copied ${n} faces to public/fonts/`);
}

const cmd = process.argv[2];
if (cmd === "css") writeCss();
else if (cmd === "fonts") copyFonts();
else {
  console.error("usage: node scripts/looks.mjs css|fonts");
  process.exit(1);
}
