// Sky on the phone (ANDROID_APP_SPEC.md §9). The colours are the web's own names and values (../../../src/app/
// globals.css, the :root block and its dark twin); a stylesheet cannot be read by a phone app, so they are written
// out again here and must be kept in step by hand until the looks are generated for both (§10, step 6). Light or
// dark follows the phone's own setting, as the web's "System" theme does, unless Settings › Appearance chose one for
// this phone (theme-choice.ts).
import { useColorScheme } from "react-native";
import type { DayPart } from "@/features/looks/look";
import { useThemeChoice } from "./theme-choice";

const light = {
  paper: "#e8f0fa",
  surface: "#fbfdff",
  surface2: "#edf3fa",
  line: "#d3dfed",
  lineStrong: "#b4c4d8",
  lineControl: "#6c7f9c",
  ink: "#0e2240",
  ink2: "#34496b",
  ink3: "#435775",
  ink4: "#6b7f9e",
  spare: "#087a70",
  spareFill: "#14b8a6",
  spareSoft: "#cff5ef",
  meetFill: "#6f80ff",
  over: "#8a5a00",
  overFill: "#d48a1e",
  overSoft: "#fdeccc",
  deadline: "#b23a2e",
  blockFill: "#1f3357",
  scrim: "rgba(14, 30, 60, 0.32)",
};

const dark: typeof light = {
  paper: "#101b3a",
  surface: "#16224a",
  surface2: "#1e2b57",
  line: "#2a3a66",
  lineStrong: "#3d4f84",
  lineControl: "#8090b8",
  ink: "#f1f5ff",
  ink2: "#c3cde4",
  ink3: "#a6b2cd",
  ink4: "#7f8db0",
  spare: "#5ce6d7",
  spareFill: "#2dd4bf",
  spareSoft: "#12363f",
  meetFill: "#7b8cff",
  over: "#f2c27a",
  overFill: "#d9a04a",
  overSoft: "#3a2e1a",
  deadline: "#ff9d8f",
  blockFill: "#8a9ac2",
  scrim: "rgba(0, 0, 0, 0.55)",
};

export type Colours = typeof light;
export type Scheme = "light" | "dark";
export const colours: Record<Scheme, Colours> = { light, dark };

/** The sky behind everything, top to bottom: by the hour in the light theme, one night sky in the dark. */
const SKY: Record<DayPart, readonly [string, string, string]> = {
  morning: ["#cfe5ff", "#e9f2fc", "#fbf3e6"],
  afternoon: ["#c3defd", "#e6f0fb", "#fbeadf"],
  evening: ["#d9d3fb", "#ece9f8", "#fce3d8"],
  night: ["#d3dcef", "#e7ecf5", "#efecf4"],
};
const SKY_DARK: readonly [string, string, string] = ["#0a1430", "#111d40", "#1e1d47"];

export function sky(scheme: Scheme, part: DayPart): readonly [string, string, string] {
  return scheme === "dark" ? SKY_DARK : SKY[part];
}

/** Light or dark as it is drawn now: this phone's choice in Settings › Appearance, or the phone's own setting on System. */
export function useScheme(): Scheme {
  const system = useColorScheme();
  const choice = useThemeChoice();
  if (choice !== "system") return choice;
  return system === "dark" ? "dark" : "light";
}

export function useColours(): Colours {
  return colours[useScheme()];
}

/** Plus Jakarta Sans, the face of Sky, by weight (loaded in ui/fonts.ts). */
export const font = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
} as const;

/** One touch target: 44 points, as on the web (DESIGN_SYSTEM.md §4a). */
export const TARGET = 44;
