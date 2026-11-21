// Which file draws which text in a look: the web's faces (--face-sans, --face-display, --face-qualifier,
// --face-control and their weights, ../../../../src/app/globals.css and public/looks/*.css, read into `useShape()`)
// turned into the font names the phone has (face-files.ts). Screens never name a file: their styles say what the text
// is with `font` (a weight of the UI face, or the display face, the qualifier or a control's face), and the app's
// `Text` (ui/text.tsx) draws it in the look on screen. The keys' values are Sky's own font names, so a text drawn
// outside that `Text` is still in Sky's face, never the system's.
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import { DEFAULT_LOOK } from "@/features/looks/look";
import { FACE_FAMILIES, type FaceFamily, type FontAsset } from "./face-files";
import { tokensOf } from "./look-choice";

/**
 * What a text is, as a `fontFamily` in a style. The weights are the UI face's (the web's `font-medium`, …, in
 * `--face-sans`); `display` is the display face at the look's display weight (the web's `font-display font-book`: the
 * screen titles, the spare figure), `displayMedium` the same face at 500 (`font-display font-medium`: a sheet's or a
 * pane's heading), `qualifier` the word beside the figure (`font-display-italic`: "spare" / "over"), `control` a
 * button's or a segment's words (`control-type`, at the look's control weight).
 */
export const font = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
  display: "PlusJakartaSans_Display",
  displayMedium: "PlusJakartaSans_DisplayMedium",
  qualifier: "PlusJakartaSans_Qualifier",
  control: "PlusJakartaSans_Control",
} as const;
export type FontKey = keyof typeof font;
export const FONT_KEYS = Object.keys(font) as FontKey[];

/** One text's face: the font to draw it in, a weight and slant only where the file cannot carry them. */
export interface Face {
  fontFamily: string;
  /** Only for the phone's own family (Roboto Flex's missing weights): a file is already its weight. */
  fontWeight?: TextStyle["fontWeight"];
  /** Only where the look asks for an italic the family has no file for (the phone slants it, as a browser would). */
  fontStyle?: "italic";
  /** The look's letter spacing for the display face, in em (`.font-display` on the web). */
  tracking?: number;
}

const WEIGHT_NAMES: Record<number, string> = { 100: "100Thin", 200: "200ExtraLight", 300: "300Light", 400: "400Regular", 500: "500Medium", 600: "600SemiBold", 700: "700Bold", 800: "800ExtraBold", 900: "900Black" };

/** The packages' name for one file of a family, which is also the name it is loaded and drawn under. */
export const fontName = (family: FaceFamily, weight: number, italic = false): string => `${family.id}_${WEIGHT_NAMES[weight]}${italic ? "_Italic" : ""}`;

/**
 * The weight a browser draws for `desired` from the weights a family has (CSS Fonts 4, font matching, font-weight):
 * from 400 to 500 it looks up to 500, then down, then up past 500; under 400 down then up; over 500 up then down.
 */
export function matchWeight(desired: number, available: readonly number[]): number {
  const up = [...available].sort((a, b) => a - b);
  const down = [...up].reverse();
  const order =
    desired >= 400 && desired <= 500
      ? [...up.filter((w) => w >= desired && w <= 500), ...down.filter((w) => w < desired), ...up.filter((w) => w > 500)]
      : desired < 400
        ? [...down.filter((w) => w <= desired), ...up.filter((w) => w > desired)]
        : [...up.filter((w) => w >= desired), ...down.filter((w) => w < desired)];
  return order[0] ?? 400;
}

const weights = (files: Partial<Record<number, FontAsset>> | undefined): number[] => Object.keys(files ?? {}).map(Number);

/** A face the build has no files for (a look added on the web since) is drawn in Sky's. */
const familyOf = (name: string): FaceFamily => FACE_FAMILIES[name] ?? FACE_FAMILIES["Plus Jakarta Sans"];

/** One weight of one family, slanted or not, as the phone can draw it. */
function faceIn(name: string, desired: number, italic: boolean): Face {
  const family = familyOf(name);
  if (italic && family.italic) return { fontFamily: fontName(family, matchWeight(desired, weights(family.italic)), true) };
  const slant: Pick<Face, "fontStyle"> = italic ? { fontStyle: "italic" } : {};
  if (family.system && family.normal[desired] === undefined) {
    const nearest = Math.min(900, Math.max(100, Math.round(desired / 100) * 100));
    return { fontFamily: family.system, fontWeight: String(nearest) as TextStyle["fontWeight"], ...slant };
  }
  return { fontFamily: fontName(family, matchWeight(desired, weights(family.normal))), ...slant };
}

const SANS_WEIGHT: Partial<Record<FontKey, number>> = { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 };

const cache = new Map<string, Face>();

/** The face one kind of text is drawn in, in one look. A look this build does not know is drawn as Sky. */
export function faceFor(look: string, key: FontKey): Face {
  const at = `${look}:${key}`;
  const known = cache.get(at);
  if (known) return known;
  const shape = tokensOf(look).shape;
  const sans = SANS_WEIGHT[key];
  const face =
    sans !== undefined
      ? faceIn(shape.face.sans, sans, false)
      : key === "display"
        ? { ...faceIn(shape.face.display, shape.weight.display, false), tracking: shape.tracking.display }
        : key === "displayMedium"
          ? { ...faceIn(shape.face.display, 500, false), tracking: shape.tracking.display }
          : key === "qualifier"
            ? faceIn(shape.face.qualifier, shape.weight.qualifier, shape.qualifierItalic)
            : faceIn(shape.face.control, shape.weight.control, false);
  cache.set(at, face);
  return face;
}

/** Every file a look draws with, by the name it is loaded under: what `Font.loadAsync` is given when it is chosen. */
export function fontFilesFor(look: string): Record<string, FontAsset> {
  const files: Record<string, FontAsset> = {};
  const shape = tokensOf(look).shape;
  for (const key of FONT_KEYS) {
    const name = faceFor(look, key).fontFamily;
    const role = SANS_WEIGHT[key] !== undefined ? "sans" : key === "displayMedium" ? "display" : (key as "display" | "qualifier" | "control");
    const family = familyOf(shape.face[role]);
    for (const [weight, asset] of Object.entries(family.normal)) if (fontName(family, Number(weight)) === name && asset !== undefined) files[name] = asset;
    for (const [weight, asset] of Object.entries(family.italic ?? {})) if (fontName(family, Number(weight), true) === name && asset !== undefined) files[name] = asset;
  }
  return files;
}

const KEY_OF = new Map<string, FontKey>(FONT_KEYS.map((k) => [font[k], k]));

/**
 * A text's style with the look's face put in for the `font` key it names. A style that names none (or no style) is
 * handed back as it is, so a text inside another keeps inheriting its face.
 */
export function withFace<S extends StyleProp<TextStyle>>(style: S, look: string): S | [S, TextStyle] {
  if (!style) return style;
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const key = flat?.fontFamily ? KEY_OF.get(flat.fontFamily) : undefined;
  if (!flat || !key) return style;
  const face = faceFor(look, key);
  const extra: TextStyle = {
    fontFamily: face.fontFamily,
    ...(face.fontWeight ? { fontWeight: face.fontWeight } : {}),
    ...(face.fontStyle ? { fontStyle: face.fontStyle } : {}),
    ...(face.tracking !== undefined && typeof flat.fontSize === "number" ? { letterSpacing: face.tracking * flat.fontSize } : {}),
  };
  if (Object.keys(extra).length === 1 && extra.fontFamily === flat.fontFamily) return style;
  return [style, extra];
}

/** Sky's files: loaded as the app opens (ui/fonts.ts), the face every other look keeps until its own are in. */
export const skyFontFiles = (): Record<string, FontAsset> => fontFilesFor(DEFAULT_LOOK);
