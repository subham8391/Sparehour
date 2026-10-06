// Lazy pieces of the shell (SYSTEM_DESIGN.md §11.6): the quick-add sheet,
// the task detail, the palette, the bulk bar and the notification deep link
// are split out of the first download and fetched here, once the browser is
// idle after the first paint, so the first open never waits on the network —
// and works offline, because the module is already in memory by then.
import { useEffect, useState } from "react";

/** Starts `load` when the browser is idle; returns the cleanup for `useEffect`. */
export function preloadOnIdle(load: () => Promise<unknown>): () => void {
  const run = () => {
    load().catch(() => undefined); // a failed prefetch just means the first open loads it instead
  };
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(run, { timeout: 3000 });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = setTimeout(run, 1000);
  return () => clearTimeout(timer);
}

/**
 * Whether an island that keeps state of its own (the bulk bar's tag field, the deep link's action sheet) is
 * mounted: from the moment it is first `needed` or its module has loaded in idle time, whichever comes first,
 * and from then on, so it behaves as if it had been in the shell all along.
 */
export function useIdleMount(load: () => Promise<unknown>, needed: boolean): boolean {
  const [mounted, setMounted] = useState(false);
  if (needed && !mounted) setMounted(true);
  useEffect(() => preloadOnIdle(() => load().then(() => setMounted(true))), [load]);
  return mounted;
}
