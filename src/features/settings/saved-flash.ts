// The "Saved" that follows a change in Settings for a second and a half (SCREENS.md §18: "saves immediately with an
// inline Saved"). Its own module, free of the web's screen parts, so the Android app's Settings says it for as long
// (docs/mobile/ANDROID_APP_SPEC.md §4.3); settings-ui.tsx hands it on, so the web's imports are unchanged.
import { useEffect, useState } from "react";

/** How long "Saved" stays. */
export const SAVED_MS = 1500;

/** Whether "Saved" shows now, and the call that starts it. */
export function useSavedFlash(): [boolean, () => void] {
  const [at, setAt] = useState(0);
  const [hiddenAt, setHiddenAt] = useState(0);
  useEffect(() => {
    if (!at) return;
    const t = setTimeout(() => setHiddenAt(at), SAVED_MS);
    return () => clearTimeout(t);
  }, [at]);
  return [at !== 0 && hiddenAt !== at, () => setAt(Date.now())];
}
