// The look on the phone (ANDROID_APP_SPEC.md §9; DECISIONS.md, amendment 2026-10-20): every colour and shape a
// screen draws with, by the web's own names. The values are not typed here: scripts/build-looks.mjs reads them from
// the web's stylesheets (../../../src/app/globals.css and ../../../public/looks/*.css) into looks/generated.ts, for
// all of the web's looks in light and dark. Which look is the account's choice, kept on the phone too
// (looks/look-choice.ts); light or dark is the account's theme, or the phone's own setting on System
// (theme-choice.ts). A change to either redraws every screen at once: they all read through `useColours()`.
import { useColorScheme, type ViewStyle } from "react-native";
import { DEFAULT_LOOK, type DayPart } from "@/features/looks/look";
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
 * Plus Jakarta Sans, the face of Sky, by weight (loaded in ui/fonts.ts). Every look is drawn in it on the phone for
 * now: a look's own faces are named in its shape (`useShape().face`), but their files are not in the app yet.
 */
export const font = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
} as const;

/** One touch target: 44 points, as on the web (DESIGN_SYSTEM.md §4a). */
export const TARGET = 44;
