// The look on the phone (ANDROID_APP_SPEC.md §9; DECISIONS.md, amendment 2026-10-20): every colour and shape a
// screen draws with, by the web's own names. The values are not typed here: scripts/build-looks.mjs reads them from
// the web's stylesheets (../../../src/app/globals.css and ../../../public/looks/*.css) into looks/generated.ts, for
// all of the web's looks in light and dark. Which look is the account's choice, kept on the phone too
// (looks/look-choice.ts); light or dark is the account's theme, or the phone's own setting on System
// (theme-choice.ts). A change to either redraws every screen at once: they all read through `useColours()`.
import { useMemo } from "react";
import { useColorScheme, type TextStyle, type ViewStyle } from "react-native";
import { DEFAULT_LOOK, type DayPart } from "@/features/looks/look";
import { useFaceLook } from "./looks/face-loader";
import { FONT_KEYS, faceFor, type Face, type FontKey } from "./looks/faces";
import { LOOK_TOKENS } from "./looks/generated";
import { lookChoice, tokensOf, useLookChoice } from "./looks/look-choice";
import type { LookColours, LookShadows, LookShape, Radius, Sky } from "./looks/types";
import { themeChoice, useThemeChoice } from "./theme-choice";

export type Colours = LookColours;
export type Scheme = "light" | "dark";
/** Sky's two sets, for what is drawn outside any look (a test, a fixture). Screens read `useColours()`. */
export const colours: Record<Scheme, Colours> = { light: LOOK_TOKENS[DEFAULT_LOOK].light.colours, dark: LOOK_TOKENS[DEFAULT_LOOK].dark.colours };

/**
 * What is behind everything, top to bottom, in the look on screen: the sky by the hour where the look paints one
 * (Sky: by the hour in light, one night sky in dark), the look's flat page three times where it does not.
 */
export function sky(scheme: Scheme, part: DayPart): Sky {
  const theme = tokensOf(lookChoice())[scheme];
  return theme.sky?.[part] ?? [theme.colours.paper, theme.colours.paper, theme.colours.paper];
}

/** Light or dark as it is drawn now: the choice in Settings › Appearance, or the phone's own setting on System. */
export function useScheme(): Scheme {
  const system = useColorScheme();
  const choice = useThemeChoice();
  if (choice !== "system") return choice;
  return system === "dark" ? "dark" : "light";
}

/** The same answer outside a component (the system bars): no redraw comes of it. */
export function schemeNow(system: "light" | "dark" | "unspecified" | null | undefined): Scheme {
  const choice = themeChoice();
  if (choice !== "system") return choice;
  return system === "dark" ? "dark" : "light";
}

/** The look's id, as the account keeps it ("sky", "daylight", …). */
export function useLook(): string {
  return useLookChoice();
}

export function useColours(): Colours {
  const scheme = useScheme();
  return tokensOf(useLookChoice())[scheme].colours;
}

/** The look's radii, edges, faces and weights: the same in light and dark. */
export function useShape(): LookShape {
  return tokensOf(useLookChoice()).shape;
}

/**
 * How the look sets a page's title ("title", the web's `h1`) or the "spare" / "over" word ("qualifier", the web's
 * `.font-display-italic`), as a style to put after the words' own: letter case, letter spacing, a size relative to
 * `fontSize` (the words' own size) and a slant. Empty for a look that sets them as drawn.
 */
export function useWords(kind: "title" | "qualifier", fontSize: number): TextStyle {
  const rule = useShape().words[kind];
  const size = rule.size ? fontSize * rule.size : fontSize;
  return {
    ...(rule.case && rule.case !== "none" ? { textTransform: rule.case } : {}),
    ...(rule.tracking !== undefined ? { letterSpacing: rule.tracking * size } : {}),
    ...(rule.size ? { fontSize: size } : {}),
    ...(rule.italic !== undefined ? { fontStyle: rule.italic ? "italic" : "normal" } : {}),
  };
}

/** The look's shadows in the theme on screen, each a `boxShadow` value or null for none. */
export function useShadows(): LookShadows {
  const scheme = useScheme();
  return tokensOf(useLookChoice())[scheme].shadows;
}

/** A look's radius as a style: one number for most looks, four corners where the look draws an uneven shape. */
export function corners(radius: Radius): ViewStyle {
  if (typeof radius === "number") return { borderRadius: radius };
  const [topLeft, topRight, bottomRight, bottomLeft] = radius;
  return { borderTopLeftRadius: topLeft, borderTopRightRadius: topRight, borderBottomRightRadius: bottomRight, borderBottomLeftRadius: bottomLeft };
}

/**
 * What a text is, for its style's `fontFamily`: a weight of the look's UI face (`regular` … `extrabold`), its display
 * face (`display`, `displayMedium`), the qualifier word or a control's words. The app's `Text` (ui/text.tsx) draws it
 * in the faces of the look on screen (looks/faces.ts), so a StyleSheet stays a constant and still follows the look.
 */
export { font, type Face, type FontKey } from "./looks/faces";

/** The font names the look on screen draws each kind of text in, for what is not drawn by the app's `Text`. */
export function useFont(): Record<FontKey, string> {
  const look = useFaceLook();
  return useMemo(() => Object.fromEntries(FONT_KEYS.map((k) => [k, faceFor(look, k).fontFamily])) as Record<FontKey, string>, [look]);
}

/** The same with each face's weight, slant and display tracking, where a text needs them as a style. */
export function useFaces(): Record<FontKey, Face> {
  const look = useFaceLook();
  return useMemo(() => Object.fromEntries(FONT_KEYS.map((k) => [k, faceFor(look, k)])) as Record<FontKey, Face>, [look]);
}

/** One touch target: 44 points, as on the web (DESIGN_SYSTEM.md §4a). */
export const TARGET = 44;
