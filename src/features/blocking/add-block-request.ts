// The palette's "Add time block" (SCREENS.md §12 Create; DECISIONS.md "Palette Add tag and Add time block"): an
// untitled 30-minute block of your own in the next free gap from now on today, selected with its title ready to
// rename. Today's day pane takes the request while it shows today; from anywhere else the request waits until it
// does, as Today's other requests do (features/today/today-request.ts) — but only briefly: Today shows no day pane on
// a day without working hours, and a request left waiting there must not make a block minutes or hours later, when
// the pane next appears.
type Handler = () => void;

/** How long a request waits for today's day pane: Today and its pane island load well within it. */
export const ADD_BLOCK_WAIT_MS = 15_000;

let handler: Handler | null = null;
let pendingAt: number | null = null;

/** Places the block; false when today's timeline is not open (the request then waits for it, briefly). */
export function requestAddBlock(now: number = Date.now()): boolean {
  if (handler) {
    handler();
    return true;
  }
  pendingAt = now;
  return false;
}

/** Today's day pane listens while it shows today; a request still waiting is taken at once. Returns the cleanup. */
export function onAddBlock(h: Handler, now: number = Date.now()): () => void {
  handler = h;
  if (pendingAt !== null) {
    const fresh = now - pendingAt <= ADD_BLOCK_WAIT_MS;
    pendingAt = null;
    if (fresh) h();
  }
  return () => {
    if (handler === h) handler = null;
  };
}

/** For tests. */
export function resetAddBlock(): void {
  handler = null;
  pendingAt = null;
}
