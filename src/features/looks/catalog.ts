// Every look the picker offers (DECISIONS.md, amendment 2026-10-20), in the order it shows them: Sky, the default, then
// Daylight, the original, then the directions A to Z from the looks page. Only Settings loads this file. A look's
// stylesheet is public/looks/<id>.css (look.ts); `ready` holds back a look whose sheet is not built yet. The swatches
// draw the picker's small preview in the theme on screen: page, card, ink, and the colour that means spare time.
import { DEFAULT_LOOK } from "./look";

export interface Swatch {
  page: string;
  card: string;
  ink: string;
  spare: string;
}

export interface Look {
  id: string;
  name: string;
  /** A few words on how it feels. */
  feel: string;
  light: Swatch;
  dark: Swatch;
  ready: boolean;
}

const sw = (page: string, card: string, ink: string, spare: string): Swatch => ({ page, card, ink, spare });

export const LOOKS: readonly Look[] = [
  { id: DEFAULT_LOOK, name: "Sky", feel: "Frosted glass over the sky at this hour", light: sw("#d6e8fc", "#fbfdff", "#0e2240", "#14b8a6"), dark: sw("#101b3a", "#16224a", "#f1f5ff", "#2dd4bf"), ready: true },
  { id: "daylight", name: "Daylight", feel: "The original: calm and editorial", light: sw("#f4f8f6", "#ffffff", "#161c19", "#19966e"), dark: sw("#0c110f", "#151917", "#e8ecea", "#46b68c"), ready: true },
  { id: "timetable", name: "Timetable", feel: "A railway board: bold numbers, hour cells", light: sw("#ffffff", "#f2f4f7", "#0f141b", "#ffc20e"), dark: sw("#0e1116", "#171c24", "#f2f4f7", "#ffd24a"), ready: false },
  { id: "sunwise", name: "Sunwise", feel: "Soft and friendly: sky and sun", light: sw("#eef3fb", "#ffffff", "#1d2148", "#f7b500"), dark: sw("#141633", "#1e2147", "#eef0ff", "#ffc533"), ready: false },
  { id: "studio", name: "Studio", feel: "Bold outlines and hard shadows", light: sw("#ffffff", "#ffffff", "#111111", "#19d48a"), dark: sw("#121212", "#1a1a1a", "#f5f5f5", "#19d48a"), ready: false },
  { id: "highlighter", name: "Highlighter", feel: "A paper planner, marked up by hand", light: sw("#ffffff", "#ffffff", "#1b1e26", "#dcf65a"), dark: sw("#15171c", "#1b1e25", "#eef0f4", "#c8ee3a"), ready: false },
  { id: "dusk", name: "Dusk", feel: "Evening plum with a teal glow", light: sw("#faf5ff", "#ffffff", "#2a1636", "#19b39a"), dark: sw("#1d1024", "#2a1a33", "#fbeefa", "#4fe0c4"), ready: false },
  { id: "casio", name: "Casio", feel: "A digital watch face", light: sw("#e7e9e2", "#c6d2b0", "#1a1f16", "#ff6a1a"), dark: sw("#151714", "#0f2a33", "#e6eadf", "#ff6a1a"), ready: false },
  { id: "pulse", name: "Pulse", feel: "A sports watch: energetic", light: sw("#f3f4f6", "#ffffff", "#0a0b0d", "#2f6bff"), dark: sw("#0b0c0f", "#17191e", "#f4f5f7", "#4d82ff"), ready: false },
  { id: "color-field", name: "Color Field", feel: "A bold colour for every view", light: sw("#ffd84d", "#ffffff", "#111111", "#3d5afe"), dark: sw("#141414", "#222222", "#f2f2f2", "#ffd84d"), ready: false },
  { id: "indigo", name: "Indigo", feel: "Japanese indigo: quiet and exact", light: sw("#f7f8fa", "#ffffff", "#1b2433", "#264d73"), dark: sw("#0f1622", "#162030", "#e9eef5", "#86acdc"), ready: false },
  { id: "material", name: "Material", feel: "At home on Android", light: sw("#f6fbf3", "#e6efe2", "#191d18", "#1b6c3d"), dark: sw("#10140f", "#1c211b", "#e0e4dc", "#88d99c"), ready: false },
  { id: "terminal", name: "Terminal", feel: "Keyboard-first: amber on charcoal", light: sw("#17181c", "#1f2026", "#e6e6e6", "#ffb000"), dark: sw("#17181c", "#1f2026", "#e6e6e6", "#ffb000"), ready: false },
  { id: "bauhaus", name: "Bauhaus", feel: "Circles, squares, primary colour", light: sw("#ffffff", "#f1f2f4", "#111111", "#1f4bd8"), dark: sw("#121212", "#1d1d1f", "#f2f2f2", "#4f78ff"), ready: false },
  { id: "riso", name: "Riso", feel: "Two-ink print, a little off register", light: sw("#fbfbfa", "#ffffff", "#1d2a8a", "#ff4fa3"), dark: sw("#14152a", "#1b1d36", "#c9d2ff", "#ff6fb6"), ready: false },
  { id: "tide", name: "Tide", feel: "Calm ocean blue", light: sw("#eef6fa", "#ffffff", "#0b2a3a", "#1475e1"), dark: sw("#061a26", "#0b2636", "#e3f3fa", "#3aa0ff"), ready: false },
  { id: "quest", name: "Quest", feel: "Your day as a game", light: sw("#eef1ff", "#ffffff", "#1b1d3a", "#3b82f6"), dark: sw("#12132a", "#1c1e3d", "#eef0ff", "#60a5fa"), ready: false },
  { id: "sundial", name: "Sundial", feel: "Sun gold on cool white", light: sw("#f5f7fb", "#ffffff", "#14213d", "#ffa630"), dark: sw("#0d1424", "#141e33", "#eaf0ff", "#ffb547"), ready: false },
  { id: "garden", name: "Garden", feel: "Soft organic shapes, leaf and petal", light: sw("#fdf7f9", "#ffffff", "#23301f", "#4caf50"), dark: sw("#121a14", "#1a241c", "#eaf3ea", "#74c97c"), ready: false },
  { id: "chrome", name: "Chrome", feel: "Y2K metal and holographic", light: sw("#e9ebef", "#f4f5f8", "#1a1d24", "#c79bff"), dark: sw("#0d0f14", "#22262e", "#eef1f6", "#c9a8ff"), ready: false },
  { id: "blueprint", name: "Blueprint", feel: "Drawn like a technical plan", light: sw("#0f3d6e", "#134a82", "#eaf4ff", "#ffd166"), dark: sw("#082a4c", "#0d3a66", "#eaf4ff", "#ffd166"), ready: false },
  { id: "sticker", name: "Sticker", feel: "Pastel stickers with white outlines", light: sw("#fff2fa", "#ffffff", "#3b2a4a", "#7ee0b5"), dark: sw("#22182d", "#2f2440", "#fff0fb", "#8ef0c4"), ready: false },
  { id: "noir", name: "Noir", feel: "A luxury watch: black and champagne", light: sw("#ffffff", "#ffffff", "#141414", "#a8874a"), dark: sw("#0b0b0c", "#141416", "#f3efe6", "#c9a96e"), ready: false },
  { id: "workshop", name: "Workshop", feel: "Stencils and hazard stripes", light: sw("#f2f2ef", "#ffffff", "#121212", "#ffcc00"), dark: sw("#141414", "#1d1d1d", "#f2f2f2", "#ffcc00"), ready: false },
  { id: "metro", name: "Metro", feel: "Transit signs and line colours", light: sw("#ffffff", "#f4f5f7", "#101820", "#0072ce"), dark: sw("#0e1217", "#161b22", "#f0f3f6", "#3a9bff"), ready: false },
  { id: "scrapbook", name: "Scrapbook", feel: "Sticky notes, tape and handwriting", light: sw("#eef1f4", "#ffffff", "#2b2f36", "#ffe873"), dark: sw("#1c1f24", "#2a2e35", "#f1f2f4", "#ffe873"), ready: false },
  { id: "zero", name: "Zero", feel: "Nothing but type", light: sw("#ffffff", "#ffffff", "#000000", "#ff5c00"), dark: sw("#000000", "#000000", "#ffffff", "#ff5c00"), ready: false },
];

export const readyLooks = () => LOOKS.filter((l) => l.ready);
export const findLook = (id: string) => LOOKS.find((l) => l.id === id);
