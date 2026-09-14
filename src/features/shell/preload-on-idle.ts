// Lazy pieces of the shell (SYSTEM_DESIGN.md §11.6): the quick-add sheet and
// the task detail panel are split out of the first download and fetched here,
// once the browser is idle after the first paint, so the first open never
// waits on the network — and works offline, because the module is already in
// memory by then.

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
