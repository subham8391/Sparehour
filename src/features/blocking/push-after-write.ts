// After a block changes, ask the server to write it to Google now rather than
// at the next reconcile (SYSTEM_DESIGN.md §6.5). Debounced: a drag produces a
// burst of moves and one push is enough. Nothing to do when there is no write
// calendar — the endpoint answers at once — and offline the request simply
// fails; the reconcile picks the block up later.
const DEBOUNCE_MS = 2000;
let timer: ReturnType<typeof setTimeout> | null = null;

export function schedulePush(fetchImpl: typeof fetch = fetch, delay = DEBOUNCE_MS): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    fetchImpl("/api/calendar/push", { method: "POST", credentials: "include" }).catch(() => undefined);
  }, delay);
}

/** For tests. */
export function cancelScheduledPush(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}
