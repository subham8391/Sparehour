// What must be in before anything is drawn (the splash stays up meanwhile): Sky's typeface, and this phone's own
// copy of the theme, the look and the motion choice (ui/kept.ts) with that look's own faces (looks/face-loader.ts),
// so the first frame after a cold start is already in the person's look and its type, and not in Sky for a moment.
// The phone's own bars are told from here too (looks/system-bars.tsx), once, as the app opens.
import { useFonts } from "expo-font";
import { useEffect, useState } from "react";
import { keptFacesReady } from "./looks/face-loader";
import { skyFontFiles } from "./looks/faces";
import { watchSystemBars } from "./looks/system-bars";
import { motionChoiceReady } from "./motion";
import { themeChoiceReady } from "./theme-choice";

/**
 * The longest the first frame waits for the device's kept choices and the kept look's faces: a store that never
 * answers must not hold the app on its splash (the text then shows in Sky's face until the look's are in).
 */
const KEPT_WAIT_MS = 1500;

/** Sky's files, read once: the app's first face, and the one every look keeps until its own are in. */
const SKY = skyFontFiles();

/**
 * True once Sky's faces are in, or could not be loaded (the app then draws in the system face rather than not at
 * all), and the phone's kept theme, look and motion choice have been read, with the kept look's faces.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(SKY);
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
    void Promise.all([themeChoiceReady(), keptFacesReady(), motionChoiceReady()]).then(done, done);
    return () => {
      live = false;
      clearTimeout(giveUp);
      stop?.();
    };
  }, []);
  return (loaded || error !== null) && kept;
}
