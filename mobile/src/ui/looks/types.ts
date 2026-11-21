// What a look is on the phone (DECISIONS.md, amendment 2026-10-20; docs/design/DESIGN_SYSTEM.md): the web's tokens
// as plain values. The names are the web's own custom properties in camel case (--surface-2 is surface2), so a screen
// reads the same colour by the same name on both. The values are written by scripts/build-looks.mjs (generated.ts).
import type { DayPart } from "@/features/looks/look";

/** Every colour of one theme. Each is a value React Native draws as it is: #rrggbb, rgba() or "transparent". */
export interface LookColours {
  paper: string;
  surface: string;
  surface2: string;
  surface3: string;
  hover: string;
  press: string;
  scrim: string;
  line: string;
  lineStrong: string;
  lineControl: string;
  ink: string;
  ink2: string;
  ink3: string;
  /** Placeholders and disabled text only. */
  ink4: string;
  inkInverse: string;
  spare: string;
  spareFill: string;
  spareSoft: string;
  spareLine: string;
  meet: string;
  meetFill: string;
  meetSoft: string;
  meetLine: string;
  over: string;
  overFill: string;
  overSoft: string;
  overLine: string;
  deadline: string;
  deadlineFill: string;
  deadlineSoft: string;
  deadlineLine: string;
  blockFill: string;
  blockSoft: string;
  hatch: string;
  meetSoftPast: string;
  blockSoftPast: string;
  raisedBorder: string;
  /** The hero card and the sticky bars; a wash over the sky in Sky, the card colour in a flat look. */
  glass: string;
  bar: string;
  chrome: string;
  /** The part of the day that has gone, over the ribbon's spare track. */
  elapsed: string;
  /** The primary button's fill, its text and its edge ("transparent" where the look draws none). */
  btn: string;
  btnInk: string;
  btnLine: string;
  btn2Ink: string;
  btn2Line: string;
  /** The segmented control: its rail, a choice's text, the chosen tile and its text, the rail's edge. */
  seg: string;
  segInk: string;
  segHover: string;
  segOn: string;
  segOnInk: string;
  segLine: string;
  /** The task check's ring, and a switch that is off. */
  checkLine: string;
  switchOff: string;
  /** The phone's add button. */
  fab: string;
  fabInk: string;
  /** The ribbon's spare track. */
  track: string;
}

/** One theme's shadows as React Native `boxShadow` values; null where the look casts none. */
export interface LookShadows {
  /** Raised popovers. */
  raised: string | null;
  /** The bottom sheet. */
  float: string | null;
  fab: string | null;
  active: string | null;
  btn: string | null;
  btn2: string | null;
  seg: string | null;
  segOn: string | null;
}

/** One corner: points, or a share of the box ("60%"). */
export type Corner = number | `${number}%`;
/** One radius for every corner, or four: top-left, top-right, bottom-right, bottom-left. */
export type Radius = number | readonly [Corner, Corner, Corner, Corner];

/** What does not change with the theme: radii, edges, faces and weights. */
export interface LookShape {
  radius: { xs: Radius; sm: Radius; lg: Radius; xl: Radius; sheet: Radius; fab: Radius; control: Radius; seg: Radius; segOn: Radius; pill: Radius; chip: Radius; check: Radius; track: Radius };
  /** Border widths: buttons, the task's check, the segmented rail. */
  border: { control: number; check: number; seg: number };
  /** The first family each face names on the web. */
  face: { display: string; sans: string; qualifier: string; control: string };
  weight: { display: number; qualifier: number; control: number };
  /** Letter spacing in em: multiply by the font size. */
  tracking: { display: number; control: number };
  controlCase: "none" | "uppercase" | "lowercase";
  qualifierItalic: boolean;
  /** The look frosts what is behind its glass (the web's backdrop-filter; a phone draws the wash without the blur). */
  glassBlur: boolean;
  /** The ribbon's spare track is a dot grid, not a solid bar. */
  trackDotted: boolean;
}

/** The backdrop top to bottom. */
export type Sky = readonly [string, string, string];

export interface LookTheme {
  colours: LookColours;
  shadows: LookShadows;
  /** The sky behind everything, by the part of the day; null for a look whose page is flat (its `paper`). */
  sky: Record<DayPart, Sky> | null;
}

export interface LookTokens {
  light: LookTheme;
  dark: LookTheme;
  shape: LookShape;
}
