// The palette's "Add time block" (SCREENS.md §12 Create; DECISIONS.md "Palette Add tag and Add time block"): an
// untitled 30-minute block of your own in the next free gap from now on today, selected with its title ready to
// rename. Today's day pane takes the request while it shows today; from anywhere else the request waits until it
// does, as Today's other requests do (features/today/today-request.ts).
type Handler = () => void;

let handler: Handler | null = null;
let pending = false;

/** Places the block; false when today's timeline is not open (the request then waits for it). */
export function requestAddBlock(): boolean {
  if (handler) {
    handler();
    return true;
  }
  pending = true;
  return false;
}

/** Today's day pane listens while it shows today; a waiting request is taken at once. Returns the cleanup. */
export function onAddBlock(h: Handler): () => void {
  handler = h;
  if (pending) {
    pending = false;
    h();
  }
  return () => {
    if (handler === h) handler = null;
  };
}

/** For tests. */
export function resetAddBlock(): void {
  handler = null;
  pending = false;
}
