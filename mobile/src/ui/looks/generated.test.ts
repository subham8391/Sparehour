// Every look on the phone is the web's own (DECISIONS.md, amendment 2026-10-20): the table is in step with the
// stylesheets it was read from, every look the picker offers has every colour in light and dark, and each holds the
// same contrast rule the web holds its stylesheets to (../../../../src/features/looks/contrast.ts).
import { readyLooks } from "@/features/looks/catalog";
import { contrastProblems, type Tokens } from "@/features/looks/contrast";
import { dayPart } from "@/features/looks/look";
import { LOOK_TOKENS } from "./generated";
import type { LookColours, Radius } from "./types";

// Node's own, asked for by name: this app's type check knows the phone's globals, not Node's.
const { execFileSync } = require("child_process") as { execFileSync: (file: string, args: string[], options: { cwd: string; stdio: "pipe" }) => unknown };
/** mobile/, from where this test file is. */
const app = () => (expect.getState().testPath ?? "").split("/src/ui/looks/")[0];
const COLOUR = /^(#[0-9a-f]{6}|rgba\((\d{1,3}, ){3}(0|0?\.\d+)\)|transparent)$/;
/** A colour's name as the web writes it: surface2 is surface-2, btn2Ink is btn-2-ink. */
const webName = (key: string) => key.replace(/([A-Z]|\d+)/g, (m) => `-${m.toLowerCase()}`);
const asWeb = (colours: LookColours): Tokens => Object.fromEntries(Object.entries(colours).map(([key, value]) => [webName(key), value]));

const ids = Object.keys(LOOK_TOKENS);
const SKY_KEYS = Object.keys(LOOK_TOKENS.sky.light.colours).sort();

describe("the looks' table", () => {
  it("is in step with the web's stylesheets", () => {
    // The script exits 1, naming the fix, when what it would write differs from the file.
    expect(() => execFileSync("node", ["scripts/build-looks.mjs", "--check"], { cwd: app(), stdio: "pipe" })).not.toThrow();
  });

  it("has every look the picker offers, and no other", () => {
    expect([...ids].sort()).toEqual(
      readyLooks()
        .map((l) => l.id)
        .sort(),
    );
    expect(ids.length).toBe(27);
  });

  it("names the web's colours as the web does", () => {
    expect(webName("surface2")).toBe("surface-2");
    expect(webName("btn2Ink")).toBe("btn-2-ink");
    expect(webName("segOnInk")).toBe("seg-on-ink");
  });

  it("gives Sky the web's own values", () => {
    expect(LOOK_TOKENS.sky.light.colours).toMatchObject({ paper: "#e8f0fa", surface: "#fbfdff", ink: "#0e2240", spareFill: "#14b8a6", scrim: "rgba(14, 30, 60, 0.32)" });
    expect(LOOK_TOKENS.sky.dark.colours).toMatchObject({ paper: "#101b3a", ink: "#f1f5ff", spare: "#5ce6d7", seg: "rgba(0, 0, 0, 0.22)" });
    // The sky by the hour in light, one night sky in dark.
    expect(LOOK_TOKENS.sky.light.sky?.[dayPart(8)]).toEqual(["#cfe5ff", "#e9f2fc", "#fbf3e6"]);
    expect(LOOK_TOKENS.sky.light.sky?.[dayPart(14)]).toEqual(["#c3defd", "#e6f0fb", "#fbeadf"]);
    expect(LOOK_TOKENS.sky.dark.sky?.[dayPart(8)]).toEqual(["#0a1430", "#111d40", "#1e1d47"]);
    expect(LOOK_TOKENS.sky.shape.radius).toMatchObject({ lg: 14, xl: 20, sheet: 26, control: 14, segOn: 10, pill: 999 });
  });

  it("works a color-mix out in Oklab, a transparent side fading it", () => {
    // Studio: --spare-line is the fill mixed half with the card; --elapsed is the card at 60%.
    expect(LOOK_TOKENS.studio.light.colours.spareLine).toBe("#a7ebc4");
    expect(LOOK_TOKENS.studio.light.colours.elapsed).toBe("rgba(255, 255, 255, 0.6)");
    // Its hard shadow, and the dark theme's own, from the rule below the look's blocks.
    expect(LOOK_TOKENS.studio.light.shadows.btn).toBe("3px 3px 0 #111111");
    expect(LOOK_TOKENS.studio.dark.shadows.raised).toBe("4px 4px 0 #19d48a");
    expect(LOOK_TOKENS.sky.dark.shadows.raised).toBeNull();
  });

  describe.each(ids)("%s", (id) => {
    const look = LOOK_TOKENS[id];

    it.each(["light", "dark"] as const)("has every colour in %s, each one a phone can draw", (scheme) => {
      const colours = look[scheme].colours;
      expect(Object.keys(colours).sort()).toEqual(SKY_KEYS);
      for (const [key, value] of Object.entries(colours)) expect(`${key}: ${value}`).toMatch(new RegExp(`^${key}: ${COLOUR.source.slice(1, -1)}$`));
      // What every screen is drawn on is solid, and so is every fill a screen lets down into a wash of its own
      // (Today's timeline: the free gaps, a meeting, a block).
      for (const key of ["paper", "surface", "surface2", "ink", "ink2", "ink3", "ink4", "line", "lineStrong", "lineControl", "spare", "spareFill", "spareSoft", "meetFill", "over", "overFill", "overSoft", "deadline", "blockFill"] as const)
        expect(`${key}: ${colours[key]}`).toMatch(/: #[0-9a-f]{6}$/);
    });

    it.each(["light", "dark"] as const)("keeps text readable in %s, by the web's rule", (scheme) => {
      expect(contrastProblems(`${id} ${scheme}`, asWeb(look[scheme].colours))).toEqual([]);
    });

    it("paints a sky or a flat page, the same kind in both themes", () => {
      for (const scheme of ["light", "dark"] as const) {
        const sky = look[scheme].sky;
        if (sky === null) continue;
        for (const part of ["morning", "afternoon", "evening", "night"] as const) {
          expect(sky[part]).toHaveLength(3);
          for (const stop of sky[part]) expect(stop).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
      expect(look.light.sky === null).toBe(look.dark.sky === null);
      // Only Sky paints one today.
      expect(look.light.sky !== null).toBe(id === "sky");
    });

    it("has a whole shape", () => {
      const { radius, border, face, weight } = look.shape;
      const corner = (c: unknown) => (typeof c === "number" ? c >= 0 : typeof c === "string" && /^\d+(\.\d+)?%$/.test(c));
      for (const r of Object.values(radius) as Radius[]) expect(typeof r === "number" ? corner(r) : r.length === 4 && r.every(corner)).toBe(true);
      for (const width of Object.values(border)) expect(width).toBeGreaterThanOrEqual(0);
      for (const family of Object.values(face)) expect(family).toMatch(/^[A-Z][A-Za-z ]+$/);
      for (const w of Object.values(weight)) expect(w >= 100 && w <= 900).toBe(true);
    });
  });
});
