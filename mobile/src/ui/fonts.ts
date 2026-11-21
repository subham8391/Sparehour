// What must be in before anything is drawn (the splash stays up meanwhile): the app's typeface, and this phone's own
// copy of the theme, the look and the motion choice (ui/kept.ts), so the first frame after a cold start is already
// in the person's look and not in Sky for a moment. The phone's own bars are told from here too
// (looks/system-bars.tsx), once, as the app opens.
import { PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, useFonts } from "@expo-google-fonts/plus-jakarta-sans";
import { useEffect, useState } from "react";
import { lookChoiceReady } from "./looks/look-choice";
import { watchSystemBars } from "./looks/system-bars";
import { motionChoiceReady } from "./motion";
import { themeChoiceReady } from "./theme-choice";

/** The longest the first frame waits for the device's kept choices: a store that never answers must not hold the app on its splash. */
const KEPT_WAIT_MS = 1500;

/**
 * True once the faces are in, or could not be loaded (the app then draws in the system face rather than not at all),
 * and the phone's kept theme, look and motion choice have been read.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  const [kept, setKept] = useState(false);
  useEffect(() => {
    let live = true;
    let stop: (() => void) | null = null;
    const done = () => {
      if (!live || stop) return;
      // Only now, so the bars are told the kept look and never Sky first.
      stop = watchSystemBars();
      setKept(true);
    };
    const giveUp = setTimeout(done, KEPT_WAIT_MS);
    void Promise.all([themeChoiceReady(), lookChoiceReady(), motionChoiceReady()]).then(done, done);
    return () => {
      live = false;
      clearTimeout(giveUp);
      stop?.();
    };
  }, []);
  return (loaded || error !== null) && kept;
}
