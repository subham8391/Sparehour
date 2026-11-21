// One small choice remembered on this phone (the timeline's zoom, whether This evening is open, the day Carried over
// was unfolded): the web keeps each in the browser's storage under the same key, which cannot be read here. Until the
// phone's copy has been read the value is null, and a choice made meanwhile stands.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

export function useDeviceValue(key: string): [string | null, (value: string) => void] {
  const [value, setShown] = useState<string | null>(null);
  const chosen = useRef(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(key)
      .then((saved) => {
        if (live && !chosen.current && saved !== null) setShown(saved);
      })
      // Where the phone's storage cannot be read, the choice lives for as long as the screen does.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key]);
  const set = useCallback(
    (next: string) => {
      chosen.current = true;
      setShown(next);
      AsyncStorage.setItem(key, next).catch(() => undefined);
    },
    [key],
  );
  return [value, set];
}
