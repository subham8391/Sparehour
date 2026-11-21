// The "Calendar week" view preference on this phone (SCREENS.md §3): remembered per device, as the web remembers it
// in the browser (../../../../src/features/upcoming/use-week-view.ts, which reads the browser's storage and so cannot
// run here). The modes themselves, and which days each shows, are the web's (week.ts).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WeekMode } from "@/features/upcoming/week";

/** The web's own key for the same choice. */
export const WEEK_MODE_KEY = "sparehour.upcoming.week";

export function useWeekMode(): [WeekMode, (mode: WeekMode) => void] {
  const [mode, setShown] = useState<WeekMode>("rolling");
  // A choice made before the phone's copy has been read stands; the copy does not overwrite it.
  const chosen = useRef(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(WEEK_MODE_KEY)
      .then((saved) => {
        if (live && !chosen.current && saved === "calendar") setShown("calendar");
      })
      // Where the phone's storage cannot be read, the choice lives for as long as the screen does.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const setMode = useCallback((next: WeekMode) => {
    chosen.current = true;
    setShown(next);
    (next === "calendar" ? AsyncStorage.setItem(WEEK_MODE_KEY, next) : AsyncStorage.removeItem(WEEK_MODE_KEY)).catch(() => undefined);
  }, []);
  return [mode, setMode];
}
