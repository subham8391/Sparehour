// The palette's "Triage all" (SCREENS.md §5): the Inbox takes it while it is mounted; from anywhere else the
// request waits for the Inbox to open, as Today's requests do (features/today/today-request.ts).
type Handler = () => void;

let handler: Handler | null = null;
let pending = false;

/** Starts Triage all; false when the Inbox is not open (it then starts once the Inbox does). */
export function requestTriageAll(): boolean {
  if (handler) {
    handler();
    return true;
  }
  pending = true;
  return false;
}

/** The Inbox listens while mounted; a waiting request is taken at once. Returns the cleanup. */
export function onTriageAll(h: Handler): () => void {
  handler = h;
  if (pending) {
    pending = false;
    h();
  }
  return () => {
    if (handler === h) handler = null;
  };
}
