// The theme as this phone draws it (SCREENS.md §18 Appearance: Light, Dark or System). The choice is the account's
// (user_settings.theme: it follows the person to every device, and Settings writes it there); this is the phone's own
// copy of it, the twin of the web's in the browser's storage (../../../src/features/commands/theme.ts), so a cold
// start draws the right theme before the account's row has been read (ui/kept.ts). looks/account-look.tsx brings the
// copy up to date when the row says otherwise. System, the default, follows the phone's own setting; Light and Dark
// hold whatever the phone says. `useScheme()` in theme.ts reads it, so every colour follows at once; the phone is
// told too (Appearance.setColorScheme), so the keyboard and the system's own dialogs match.
import { Appearance } from "react-native";
import { kept, useKept } from "./kept";

export type ThemeChoice = "system" | "light" | "dark";

/** The web's key (THEME_KEY in features/commands/theme.ts, which a phone cannot load: it reaches the web's commands). */
const KEY = "sparehour.theme";

/** Tells the phone, so what the app does not draw itself follows: "unspecified" hands the choice back to the system. */
function tellPhone(next: ThemeChoice): void {
  try {
    Appearance.setColorScheme?.(next === "system" ? "unspecified" : next);
  } catch {
    // Not every platform can be told (the browser preview); the app's own colours follow regardless.
  }
}

const choice = kept<ThemeChoice>(KEY, "system", (v) => (v === "light" || v === "dark" ? v : null), tellPhone);

export const themeChoice = choice.get;
/** Shows the choice now and keeps it for the next launch. */
export const setThemeChoice = choice.set;
export const subscribeThemeChoice = choice.subscribe;
/** Resolves once this phone's copy has been read. */
export const themeChoiceReady = choice.ready;
/** For tests: forget what this run read and chose. */
export const resetThemeChoice = choice.reset;

export function useThemeChoice(): ThemeChoice {
  return useKept(choice);
}
