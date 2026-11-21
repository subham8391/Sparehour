// Sky's colours on the phone (the web's are in ../../../src/app/globals.css, the names kept the same). The first
// trial carries Sky alone, light and dark by the phone's own setting; the other looks come with ANDROID_APP_SPEC.md §9.
import { useColorScheme } from "react-native";

const light = {
  paper: "#e8f0fa",
  surface: "#fbfdff",
  surface2: "#edf3fa",
  line: "#d3dfed",
  lineControl: "#6c7f9c",
  ink: "#0e2240",
  ink2: "#34496b",
  ink3: "#435775",
  ink4: "#6b7f9e",
  spare: "#087a70",
  over: "#8a5a00",
  deadline: "#b23a2e",
};

const dark: typeof light = {
  paper: "#101b3a",
  surface: "#16224a",
  surface2: "#1e2b57",
  line: "#2a3a66",
  lineControl: "#8090b8",
  ink: "#f1f5ff",
  ink2: "#c3cde4",
  ink3: "#a6b2cd",
  ink4: "#7f8db0",
  spare: "#5ce6d7",
  over: "#f2c27a",
  deadline: "#ff9d8f",
};

export type Colours = typeof light;
export const colours = { light, dark };

export function useColours(): Colours {
  return useColorScheme() === "dark" ? dark : light;
}

/** One touch target: 44 points, as on the web (DESIGN_SYSTEM.md §4a). */
export const TARGET = 44;
