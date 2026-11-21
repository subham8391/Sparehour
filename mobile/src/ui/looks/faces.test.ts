// Every look's text is drawn in that look's own faces, at the weight a browser would pick from what the web declares.
import type { TextStyle } from "react-native";
import { FACE_FAMILIES } from "./face-files";
import { FONT_KEYS, faceFor, font, fontFilesFor, fontName, matchWeight, withFace, type FontKey } from "./faces";
import { LOOK_TOKENS } from "./generated";

// Node's own, asked for by name: this app's type check knows the phone's globals, not Node's.
const fs = require("fs") as { readdirSync: (dir: string, options: { recursive: true }) => string[] };
/** mobile/, from where this test file is. */
const app = () => (expect.getState().testPath ?? "").split("/src/ui/looks/")[0];

const LOOKS = Object.keys(LOOK_TOKENS);
const ROLE: Record<FontKey, "sans" | "display" | "qualifier" | "control"> = { regular: "sans", medium: "sans", semibold: "sans", bold: "sans", extrabold: "sans", display: "display", displayMedium: "display", qualifier: "qualifier", control: "control" };
const WEIGHT_NAMES: Record<number, string> = { 100: "100Thin", 200: "200ExtraLight", 300: "300Light", 400: "400Regular", 500: "500Medium", 600: "600SemiBold", 700: "700Bold", 800: "800ExtraBold", 900: "900Black" };

/** Families whose files are the app's own (assets/fonts), not a package's: the web's Latin-only cut, as TTF. */
const OWN_FILES: Record<string, { dir: string; name: (file: string) => string | null }> = {
  "Zen Kaku Gothic New": { dir: "assets/fonts", name: (f) => /^zen-kaku-gothic-new-latin-(\d00)\.ttf$/.exec(f)?.[1] ?? null },
};

/** The weights the package itself ships for a family (what could be listed), read from node_modules or assets/fonts. */
function packaged(family: string, italic: boolean): number[] {
  const own = OWN_FILES[family];
  if (own) {
    if (italic) return [];
    return fs
      .readdirSync(`${app()}/${own.dir}`, { recursive: true })
      .map(own.name)
      .filter((w): w is string => w !== null)
      .map(Number);
  }
  const dir = `${app()}/node_modules/@expo-google-fonts/${family.toLowerCase().replace(/ /g, "-")}`;
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith(".ttf"));
  return Object.entries(WEIGHT_NAMES)
    .filter(([, name]) => files.some((f) => f.endsWith(`_${name}${italic ? "_Italic" : ""}.ttf`)))
    .map(([w]) => Number(w));
}

/** What a key asks for in a look: its weight, and whether slanted. */
function wanted(look: string, key: FontKey): { weight: number; italic: boolean } {
  const { weight, qualifierItalic } = LOOK_TOKENS[look].shape;
  const sans: Partial<Record<FontKey, number>> = { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 };
  if (sans[key] !== undefined) return { weight: sans[key], italic: false };
  if (key === "display") return { weight: weight.display, italic: false };
  if (key === "displayMedium") return { weight: 500, italic: false };
  if (key === "qualifier") return { weight: weight.qualifier, italic: qualifierItalic };
  return { weight: weight.control, italic: false };
}

describe("every look's faces", () => {
  it.each(LOOKS)("%s names only faces the app has files for", (look) => {
    const { face } = LOOK_TOKENS[look].shape;
    for (const role of ["sans", "display", "qualifier", "control"] as const) expect([role, FACE_FAMILIES[face[role]] ? face[role] : "no files"]).toEqual([role, face[role]]);
  });

  it.each(LOOKS)("%s draws every kind of text in a font it loads, of the look's own family", (look) => {
    const files = fontFilesFor(look);
    for (const key of FONT_KEYS) {
      const family = FACE_FAMILIES[LOOK_TOKENS[look].shape.face[ROLE[key]]];
      const face = faceFor(look, key);
      if (face.fontFamily === family.system) continue;
      expect([key, face.fontFamily in files]).toEqual([key, true]);
      expect([key, face.fontFamily.startsWith(`${family.id}_`)]).toEqual([key, true]);
    }
  });

  // extrabold is not drawn by any screen, so its files are not in the app: it takes the nearest that is.
  it.each(LOOKS)("%s draws each weight the screens use as a browser would from the web's own faces", (look) => {
    for (const key of FONT_KEYS.filter((k) => k !== "extrabold")) {
      const name = LOOK_TOKENS[look].shape.face[ROLE[key]];
      const family = FACE_FAMILIES[name];
      const { weight, italic } = wanted(look, key);
      const face = faceFor(look, key);
      const has = packaged(name, italic && family.italic !== undefined);
      if (family.system && !has.filter((w) => family.web.includes(w)).includes(weight)) {
        expect([key, face.fontFamily, face.fontWeight]).toEqual([key, family.system, String(Math.round(weight / 100) * 100)]);
        continue;
      }
      // Daylight's qualifier: the web loads Newsreader's italic at 400 only.
      const declared = italic && family.italic ? Object.keys(family.italic).map(Number) : family.web;
      const best = matchWeight(weight, declared.filter((w) => has.includes(w)));
      expect([key, face.fontFamily]).toEqual([key, fontName(family, best, italic && family.italic !== undefined)]);
    }
  });

  it("lists only weights the web declares and some look draws, so no file is carried for nothing", () => {
    const used = new Set(LOOKS.flatMap((look) => Object.keys(fontFilesFor(look))));
    for (const family of Object.values(FACE_FAMILIES)) {
      for (const weight of Object.keys(family.normal).map(Number)) {
        expect([family.id, weight, family.web.includes(weight)]).toEqual([family.id, weight, true]);
        expect([fontName(family, weight), used.has(fontName(family, weight))]).toEqual([fontName(family, weight), true]);
      }
      for (const weight of Object.keys(family.italic ?? {}).map(Number)) expect(used.has(fontName(family, weight, true))).toBe(true);
    }
  });

  it("draws Sky in Plus Jakarta Sans, its display at 800 for the web's 750", () => {
    expect(faceFor("sky", "regular").fontFamily).toBe(font.regular);
    expect(faceFor("sky", "bold").fontFamily).toBe(font.bold);
    expect(faceFor("sky", "display")).toEqual({ fontFamily: "PlusJakartaSans_800ExtraBold", tracking: -0.025 });
    expect(faceFor("sky", "control").fontFamily).toBe("PlusJakartaSans_500Medium");
  });

  it("draws a look the build does not know as Sky", () => {
    expect(faceFor("not-a-look", "medium").fontFamily).toBe(font.medium);
  });
});

describe("matchWeight", () => {
  it.each([
    [750, [400, 500, 600, 700, 800], 800],
    [450, [400, 500, 600], 500],
    [450, [300, 400, 600], 400],
    [300, [400, 500], 400],
    [200, [100, 300], 100],
    [900, [400, 500, 600, 700], 700],
    [500, [400, 700], 400],
    [600, [400, 500], 500],
  ])("picks for %d from %j: %d", (desired, available, expected) => {
    expect(matchWeight(desired, available)).toBe(expected);
  });
});

describe("withFace", () => {
  const flat = (s: unknown): TextStyle => Object.assign({}, ...[s].flat(3).filter(Boolean));

  it("hands back a style that names no face, or Sky's own weight in Sky, as it is", () => {
    const plain = { fontSize: 15 };
    expect(withFace(plain, "tide")).toBe(plain);
    const sky = { fontFamily: font.medium, fontSize: 15 };
    expect(withFace(sky, "sky")).toBe(sky);
    expect(withFace(undefined, "tide")).toBeUndefined();
  });

  it("puts in the look's file for the weight, and its tracking for the display face", () => {
    expect(flat(withFace({ fontFamily: font.semibold, fontSize: 15 }, "tide")).fontFamily).toBe("Lexend_600SemiBold");
    expect(flat(withFace([{ fontFamily: font.display, fontSize: 30 }, { color: "red" }], "tide"))).toMatchObject({ fontFamily: "Lexend_600SemiBold", letterSpacing: -0.03 * 30, color: "red" });
    expect(flat(withFace({ fontFamily: font.display, fontSize: 38 }, "pulse")).fontFamily).toBe("BigShouldersDisplay_900Black");
  });

  it("draws Daylight's qualifier in Newsreader's own italic, and Material's missing weights in the phone's Roboto", () => {
    expect(flat(withFace({ fontFamily: font.qualifier, fontSize: 22 }, "daylight"))).toMatchObject({ fontFamily: "Newsreader_400Regular_Italic" });
    expect(flat(withFace({ fontFamily: font.qualifier, fontSize: 22 }, "daylight")).fontStyle).toBeUndefined();
    expect(flat(withFace({ fontFamily: font.medium, fontSize: 15 }, "material"))).toMatchObject({ fontFamily: "sans-serif", fontWeight: "500" });
    expect(flat(withFace({ fontFamily: font.regular, fontSize: 15 }, "material"))).toMatchObject({ fontFamily: "RobotoFlex_400Regular" });
  });
});
