// The files of every face a look names (DECISIONS.md, amendment 2026-10-20), as the
// Google Fonts packages ship them (@expo-google-fonts/<family>, TTF; Android cannot read the web's woff2 in
// ../../../../public/fonts). Only the weights some look draws are listed, so only those files go into the app:
// each look's UI face at 400, 500, 600 and 700 (the `font` keys the screens use), its display face at the look's
// display weight and at 500 (the pane headings), its qualifier at the qualifier weight and its control face at the
// control weight, each matched to the nearest weight the web itself declares, as a browser would (faces.ts,
// `matchWeight`). faces.test.ts fails when a look names a face, or needs a weight, that is not here.
//
// Nothing here is loaded as the app opens except Sky's (ui/fonts.ts): a look's files are read when it is chosen
// (looks/face-loader.ts). Two families are no longer on Google Fonts under the web's name and come from the last
// package that had them (Big Shoulders Display and Big Shoulders Stencil Display, before the merge into Big
// Shoulders). Roboto Flex is packaged at 400 only: its other weights are drawn by the phone's own Roboto, which is
// where the web's stack for Material (system-ui) falls on Android.
import { PlusJakartaSans_400Regular } from "@expo-google-fonts/plus-jakarta-sans/400Regular";
import { PlusJakartaSans_500Medium } from "@expo-google-fonts/plus-jakarta-sans/500Medium";
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans/600SemiBold";
import { PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans/700Bold";
import { PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans/800ExtraBold";
import { Jost_400Regular } from "@expo-google-fonts/jost/400Regular";
import { Jost_500Medium } from "@expo-google-fonts/jost/500Medium";
import { Jost_600SemiBold } from "@expo-google-fonts/jost/600SemiBold";
import { Jost_700Bold } from "@expo-google-fonts/jost/700Bold";
import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono/400Regular";
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono/500Medium";
import { IBMPlexMono_600SemiBold } from "@expo-google-fonts/ibm-plex-mono/600SemiBold";
import { IBMPlexMono_700Bold } from "@expo-google-fonts/ibm-plex-mono/700Bold";
import { Doto_500Medium } from "@expo-google-fonts/doto/500Medium";
import { Doto_900Black } from "@expo-google-fonts/doto/900Black";
import { BarlowSemiCondensed_400Regular } from "@expo-google-fonts/barlow-semi-condensed/400Regular";
import { BarlowSemiCondensed_500Medium } from "@expo-google-fonts/barlow-semi-condensed/500Medium";
import { BarlowSemiCondensed_600SemiBold } from "@expo-google-fonts/barlow-semi-condensed/600SemiBold";
import { BarlowSemiCondensed_700Bold } from "@expo-google-fonts/barlow-semi-condensed/700Bold";
import { Michroma_400Regular } from "@expo-google-fonts/michroma/400Regular";
import { Manrope_400Regular } from "@expo-google-fonts/manrope/400Regular";
import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { SchibstedGrotesk_400Regular } from "@expo-google-fonts/schibsted-grotesk/400Regular";
import { SchibstedGrotesk_500Medium } from "@expo-google-fonts/schibsted-grotesk/500Medium";
import { SchibstedGrotesk_600SemiBold } from "@expo-google-fonts/schibsted-grotesk/600SemiBold";
import { SchibstedGrotesk_700Bold } from "@expo-google-fonts/schibsted-grotesk/700Bold";
import { SchibstedGrotesk_800ExtraBold } from "@expo-google-fonts/schibsted-grotesk/800ExtraBold";
import { SchibstedGrotesk_900Black } from "@expo-google-fonts/schibsted-grotesk/900Black";
import { Newsreader_500Medium } from "@expo-google-fonts/newsreader/500Medium";
import { Newsreader_400Regular_Italic } from "@expo-google-fonts/newsreader/400Regular_Italic";
import { InstrumentSans_400Regular } from "@expo-google-fonts/instrument-sans/400Regular";
import { InstrumentSans_500Medium } from "@expo-google-fonts/instrument-sans/500Medium";
import { InstrumentSans_600SemiBold } from "@expo-google-fonts/instrument-sans/600SemiBold";
import { InstrumentSans_700Bold } from "@expo-google-fonts/instrument-sans/700Bold";
import { Unbounded_500Medium } from "@expo-google-fonts/unbounded/500Medium";
import { Unbounded_600SemiBold } from "@expo-google-fonts/unbounded/600SemiBold";
import { Onest_400Regular } from "@expo-google-fonts/onest/400Regular";
import { Onest_500Medium } from "@expo-google-fonts/onest/500Medium";
import { Onest_600SemiBold } from "@expo-google-fonts/onest/600SemiBold";
import { Onest_700Bold } from "@expo-google-fonts/onest/700Bold";
import { Gabarito_400Regular } from "@expo-google-fonts/gabarito/400Regular";
import { Gabarito_500Medium } from "@expo-google-fonts/gabarito/500Medium";
import { Gabarito_600SemiBold } from "@expo-google-fonts/gabarito/600SemiBold";
import { Gabarito_700Bold } from "@expo-google-fonts/gabarito/700Bold";
import { Gabarito_800ExtraBold } from "@expo-google-fonts/gabarito/800ExtraBold";
import { Recursive_400Regular } from "@expo-google-fonts/recursive/400Regular";
import { Recursive_500Medium } from "@expo-google-fonts/recursive/500Medium";
import { Recursive_600SemiBold } from "@expo-google-fonts/recursive/600SemiBold";
import { Recursive_700Bold } from "@expo-google-fonts/recursive/700Bold";
import { Recursive_900Black } from "@expo-google-fonts/recursive/900Black";
import { RobotoFlex_400Regular } from "@expo-google-fonts/roboto-flex/400Regular";
import { Overpass_400Regular } from "@expo-google-fonts/overpass/400Regular";
import { Overpass_500Medium } from "@expo-google-fonts/overpass/500Medium";
import { Overpass_600SemiBold } from "@expo-google-fonts/overpass/600SemiBold";
import { Overpass_700Bold } from "@expo-google-fonts/overpass/700Bold";
import { Overpass_800ExtraBold } from "@expo-google-fonts/overpass/800ExtraBold";
import { JosefinSans_200ExtraLight } from "@expo-google-fonts/josefin-sans/200ExtraLight";
import { JosefinSans_400Regular } from "@expo-google-fonts/josefin-sans/400Regular";
import { JosefinSans_500Medium } from "@expo-google-fonts/josefin-sans/500Medium";
import { JosefinSans_600SemiBold } from "@expo-google-fonts/josefin-sans/600SemiBold";
import { JosefinSans_700Bold } from "@expo-google-fonts/josefin-sans/700Bold";
import { Syncopate_700Bold } from "@expo-google-fonts/syncopate/700Bold";
import { Chivo_400Regular } from "@expo-google-fonts/chivo/400Regular";
import { Chivo_500Medium } from "@expo-google-fonts/chivo/500Medium";
import { Chivo_600SemiBold } from "@expo-google-fonts/chivo/600SemiBold";
import { Chivo_700Bold } from "@expo-google-fonts/chivo/700Bold";
import { Chivo_800ExtraBold } from "@expo-google-fonts/chivo/800ExtraBold";
import { PixelifySans_500Medium } from "@expo-google-fonts/pixelify-sans/500Medium";
import { PixelifySans_600SemiBold } from "@expo-google-fonts/pixelify-sans/600SemiBold";
import { PixelifySans_700Bold } from "@expo-google-fonts/pixelify-sans/700Bold";
import { Karla_400Regular } from "@expo-google-fonts/karla/400Regular";
import { Karla_500Medium } from "@expo-google-fonts/karla/500Medium";
import { Karla_600SemiBold } from "@expo-google-fonts/karla/600SemiBold";
import { Karla_700Bold } from "@expo-google-fonts/karla/700Bold";
import { Rubik_400Regular } from "@expo-google-fonts/rubik/400Regular";
import { Rubik_500Medium } from "@expo-google-fonts/rubik/500Medium";
import { Rubik_600SemiBold } from "@expo-google-fonts/rubik/600SemiBold";
import { Rubik_700Bold } from "@expo-google-fonts/rubik/700Bold";
import { Rubik_800ExtraBold } from "@expo-google-fonts/rubik/800ExtraBold";
import { Rubik_900Black } from "@expo-google-fonts/rubik/900Black";
import { Caveat_500Medium } from "@expo-google-fonts/caveat/500Medium";
import { Caveat_700Bold } from "@expo-google-fonts/caveat/700Bold";
import { Fredoka_400Regular } from "@expo-google-fonts/fredoka/400Regular";
import { Fredoka_500Medium } from "@expo-google-fonts/fredoka/500Medium";
import { Fredoka_600SemiBold } from "@expo-google-fonts/fredoka/600SemiBold";
import { Fredoka_700Bold } from "@expo-google-fonts/fredoka/700Bold";
import { Syne_500Medium } from "@expo-google-fonts/syne/500Medium";
import { Syne_800ExtraBold } from "@expo-google-fonts/syne/800ExtraBold";
import { Sora_400Regular } from "@expo-google-fonts/sora/400Regular";
import { Sora_500Medium } from "@expo-google-fonts/sora/500Medium";
import { Sora_600SemiBold } from "@expo-google-fonts/sora/600SemiBold";
import { Sora_700Bold } from "@expo-google-fonts/sora/700Bold";
import { BricolageGrotesque_500Medium } from "@expo-google-fonts/bricolage-grotesque/500Medium";
import { BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque/800ExtraBold";
import { Figtree_400Regular } from "@expo-google-fonts/figtree/400Regular";
import { Figtree_500Medium } from "@expo-google-fonts/figtree/500Medium";
import { Figtree_600SemiBold } from "@expo-google-fonts/figtree/600SemiBold";
import { Figtree_700Bold } from "@expo-google-fonts/figtree/700Bold";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono/400Regular";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { JetBrainsMono_600SemiBold } from "@expo-google-fonts/jetbrains-mono/600SemiBold";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono/700Bold";
import { JetBrainsMono_800ExtraBold } from "@expo-google-fonts/jetbrains-mono/800ExtraBold";
import { Lexend_400Regular } from "@expo-google-fonts/lexend/400Regular";
import { Lexend_500Medium } from "@expo-google-fonts/lexend/500Medium";
import { Lexend_600SemiBold } from "@expo-google-fonts/lexend/600SemiBold";
import { Lexend_700Bold } from "@expo-google-fonts/lexend/700Bold";
import { Archivo_400Regular } from "@expo-google-fonts/archivo/400Regular";
import { Archivo_500Medium } from "@expo-google-fonts/archivo/500Medium";
import { Archivo_600SemiBold } from "@expo-google-fonts/archivo/600SemiBold";
import { Archivo_700Bold } from "@expo-google-fonts/archivo/700Bold";
import { Archivo_800ExtraBold } from "@expo-google-fonts/archivo/800ExtraBold";
import { Archivo_900Black } from "@expo-google-fonts/archivo/900Black";
import { Saira_400Regular } from "@expo-google-fonts/saira/400Regular";
import { Saira_500Medium } from "@expo-google-fonts/saira/500Medium";
import { Saira_600SemiBold } from "@expo-google-fonts/saira/600SemiBold";
import { Saira_700Bold } from "@expo-google-fonts/saira/700Bold";
import { Saira_800ExtraBold } from "@expo-google-fonts/saira/800ExtraBold";
import { HankenGrotesk_400Regular } from "@expo-google-fonts/hanken-grotesk/400Regular";
import { HankenGrotesk_500Medium } from "@expo-google-fonts/hanken-grotesk/500Medium";
import { HankenGrotesk_600SemiBold } from "@expo-google-fonts/hanken-grotesk/600SemiBold";
import { HankenGrotesk_700Bold } from "@expo-google-fonts/hanken-grotesk/700Bold";
import { HankenGrotesk_900Black } from "@expo-google-fonts/hanken-grotesk/900Black";
// Indigo's Zen Kaku Gothic New: the web's own Latin-only files (public/fonts/zen-kaku-gothic-new-latin-*.woff2) as
// TTF, about 21 KB each. The font package ships the whole Japanese set, 2.3 MB a weight, for letters the app never shows.
const ZenKakuGothicNew_300Light: number = require("../../../assets/fonts/zen-kaku-gothic-new-latin-300.ttf");
const ZenKakuGothicNew_400Regular: number = require("../../../assets/fonts/zen-kaku-gothic-new-latin-400.ttf");
const ZenKakuGothicNew_500Medium: number = require("../../../assets/fonts/zen-kaku-gothic-new-latin-500.ttf");
const ZenKakuGothicNew_700Bold: number = require("../../../assets/fonts/zen-kaku-gothic-new-latin-700.ttf");

/** What `require` gives for a bundled file. */
export type FontAsset = number;

export interface FaceFamily {
  /** The packages' name for the family: its files register as `<id>_<weight name>`, as the packages export them. */
  id: string;
  /** The weights the web declares for the family (its @font-face ranges): a weight is matched within these only. */
  web: readonly number[];
  normal: Partial<Record<number, FontAsset>>;
  italic?: Partial<Record<number, FontAsset>>;
  /** The phone's own family for a weight the package does not have. */
  system?: string;
}

const range = (from: number, to: number): number[] => Array.from({ length: (to - from) / 100 + 1 }, (_, i) => from + i * 100);

/** By the family name the web's stylesheets give (`useShape().face`). */
export const FACE_FAMILIES: Record<string, FaceFamily> = {
  "Plus Jakarta Sans": { id: "PlusJakartaSans", web: range(200, 800), normal: { 400: PlusJakartaSans_400Regular, 500: PlusJakartaSans_500Medium, 600: PlusJakartaSans_600SemiBold, 700: PlusJakartaSans_700Bold, 800: PlusJakartaSans_800ExtraBold } },
  "Jost": { id: "Jost", web: range(100, 900), normal: { 400: Jost_400Regular, 500: Jost_500Medium, 600: Jost_600SemiBold, 700: Jost_700Bold } },
  "IBM Plex Mono": { id: "IBMPlexMono", web: range(400, 700), normal: { 400: IBMPlexMono_400Regular, 500: IBMPlexMono_500Medium, 600: IBMPlexMono_600SemiBold, 700: IBMPlexMono_700Bold } },
  "Doto": { id: "Doto", web: range(100, 900), normal: { 500: Doto_500Medium, 900: Doto_900Black } },
  "Barlow Semi Condensed": { id: "BarlowSemiCondensed", web: range(400, 700), normal: { 400: BarlowSemiCondensed_400Regular, 500: BarlowSemiCondensed_500Medium, 600: BarlowSemiCondensed_600SemiBold, 700: BarlowSemiCondensed_700Bold } },
  "Michroma": { id: "Michroma", web: [400], normal: { 400: Michroma_400Regular } },
  "Manrope": { id: "Manrope", web: range(200, 800), normal: { 400: Manrope_400Regular, 500: Manrope_500Medium, 600: Manrope_600SemiBold, 700: Manrope_700Bold, 800: Manrope_800ExtraBold } },
  "Schibsted Grotesk": { id: "SchibstedGrotesk", web: range(400, 900), normal: { 400: SchibstedGrotesk_400Regular, 500: SchibstedGrotesk_500Medium, 600: SchibstedGrotesk_600SemiBold, 700: SchibstedGrotesk_700Bold, 800: SchibstedGrotesk_800ExtraBold, 900: SchibstedGrotesk_900Black } },
  "Newsreader": { id: "Newsreader", web: range(200, 800), normal: { 500: Newsreader_500Medium }, italic: { 400: Newsreader_400Regular_Italic } },
  "Instrument Sans": { id: "InstrumentSans", web: range(400, 700), normal: { 400: InstrumentSans_400Regular, 500: InstrumentSans_500Medium, 600: InstrumentSans_600SemiBold, 700: InstrumentSans_700Bold } },
  "Unbounded": { id: "Unbounded", web: range(200, 900), normal: { 500: Unbounded_500Medium, 600: Unbounded_600SemiBold } },
  "Onest": { id: "Onest", web: range(100, 900), normal: { 400: Onest_400Regular, 500: Onest_500Medium, 600: Onest_600SemiBold, 700: Onest_700Bold } },
  "Gabarito": { id: "Gabarito", web: range(400, 900), normal: { 400: Gabarito_400Regular, 500: Gabarito_500Medium, 600: Gabarito_600SemiBold, 700: Gabarito_700Bold, 800: Gabarito_800ExtraBold } },
  "Recursive": { id: "Recursive", web: range(300, 1000), normal: { 400: Recursive_400Regular, 500: Recursive_500Medium, 600: Recursive_600SemiBold, 700: Recursive_700Bold, 900: Recursive_900Black } },
  "Zen Kaku Gothic New": { id: "ZenKakuGothicNew", web: [300, 400, 500, 700, 900], normal: { 300: ZenKakuGothicNew_300Light, 400: ZenKakuGothicNew_400Regular, 500: ZenKakuGothicNew_500Medium, 700: ZenKakuGothicNew_700Bold } },
  "Roboto Flex": { id: "RobotoFlex", web: range(100, 1000), normal: { 400: RobotoFlex_400Regular }, system: "sans-serif" },
  "Overpass": { id: "Overpass", web: range(100, 900), normal: { 400: Overpass_400Regular, 500: Overpass_500Medium, 600: Overpass_600SemiBold, 700: Overpass_700Bold, 800: Overpass_800ExtraBold } },
  "Josefin Sans": { id: "JosefinSans", web: range(100, 700), normal: { 200: JosefinSans_200ExtraLight, 400: JosefinSans_400Regular, 500: JosefinSans_500Medium, 600: JosefinSans_600SemiBold, 700: JosefinSans_700Bold } },
  "Syncopate": { id: "Syncopate", web: [400, 700], normal: { 700: Syncopate_700Bold } },
  "Big Shoulders Display": { id: "BigShouldersDisplay", web: range(100, 900), normal: { 500: require("@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_500Medium.ttf") as FontAsset, 900: require("@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_900Black.ttf") as FontAsset } },
  "Chivo": { id: "Chivo", web: range(100, 900), normal: { 400: Chivo_400Regular, 500: Chivo_500Medium, 600: Chivo_600SemiBold, 700: Chivo_700Bold, 800: Chivo_800ExtraBold } },
  "Pixelify Sans": { id: "PixelifySans", web: range(400, 700), normal: { 500: PixelifySans_500Medium, 600: PixelifySans_600SemiBold, 700: PixelifySans_700Bold } },
  "Karla": { id: "Karla", web: range(200, 800), normal: { 400: Karla_400Regular, 500: Karla_500Medium, 600: Karla_600SemiBold, 700: Karla_700Bold } },
  "Rubik": { id: "Rubik", web: range(300, 900), normal: { 400: Rubik_400Regular, 500: Rubik_500Medium, 600: Rubik_600SemiBold, 700: Rubik_700Bold, 800: Rubik_800ExtraBold, 900: Rubik_900Black } },
  "Caveat": { id: "Caveat", web: range(400, 700), normal: { 500: Caveat_500Medium, 700: Caveat_700Bold } },
  "Fredoka": { id: "Fredoka", web: range(300, 700), normal: { 400: Fredoka_400Regular, 500: Fredoka_500Medium, 600: Fredoka_600SemiBold, 700: Fredoka_700Bold } },
  "Syne": { id: "Syne", web: range(400, 800), normal: { 500: Syne_500Medium, 800: Syne_800ExtraBold } },
  "Sora": { id: "Sora", web: range(100, 800), normal: { 400: Sora_400Regular, 500: Sora_500Medium, 600: Sora_600SemiBold, 700: Sora_700Bold } },
  "Bricolage Grotesque": { id: "BricolageGrotesque", web: range(200, 800), normal: { 500: BricolageGrotesque_500Medium, 800: BricolageGrotesque_800ExtraBold } },
  "Figtree": { id: "Figtree", web: range(300, 900), normal: { 400: Figtree_400Regular, 500: Figtree_500Medium, 600: Figtree_600SemiBold, 700: Figtree_700Bold } },
  "JetBrains Mono": { id: "JetBrainsMono", web: range(100, 800), normal: { 400: JetBrainsMono_400Regular, 500: JetBrainsMono_500Medium, 600: JetBrainsMono_600SemiBold, 700: JetBrainsMono_700Bold, 800: JetBrainsMono_800ExtraBold } },
  "Lexend": { id: "Lexend", web: range(100, 900), normal: { 400: Lexend_400Regular, 500: Lexend_500Medium, 600: Lexend_600SemiBold, 700: Lexend_700Bold } },
  "Archivo": { id: "Archivo", web: range(100, 900), normal: { 400: Archivo_400Regular, 500: Archivo_500Medium, 600: Archivo_600SemiBold, 700: Archivo_700Bold, 800: Archivo_800ExtraBold, 900: Archivo_900Black } },
  "Big Shoulders Stencil Display": { id: "BigShouldersStencilDisplay", web: range(100, 900), normal: { 500: require("@expo-google-fonts/big-shoulders-stencil-display/BigShouldersStencilDisplay_500Medium.ttf") as FontAsset, 900: require("@expo-google-fonts/big-shoulders-stencil-display/BigShouldersStencilDisplay_900Black.ttf") as FontAsset } },
  "Saira": { id: "Saira", web: range(100, 900), normal: { 400: Saira_400Regular, 500: Saira_500Medium, 600: Saira_600SemiBold, 700: Saira_700Bold, 800: Saira_800ExtraBold } },
  "Hanken Grotesk": { id: "HankenGrotesk", web: range(100, 900), normal: { 400: HankenGrotesk_400Regular, 500: HankenGrotesk_500Medium, 600: HankenGrotesk_600SemiBold, 700: HankenGrotesk_700Bold, 900: HankenGrotesk_900Black } },
};
