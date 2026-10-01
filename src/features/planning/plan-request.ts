// The palette and Cmd+Shift+P ask for Plan my day from anywhere; the screen
// that can show the preview (Today, or the morning plan's last step) answers.
// A request made elsewhere waits until such a screen mounts, which is how
// "Plan my day" from Inbox lands on Today with the preview open.
import type { PlanMode } from "./drawing";

type Handler = (mode: PlanMode) => void;

let handler: Handler | null = null;
let pending: PlanMode | null = null;

/** Asks for the preview. True when a mounted screen took it; false when it waits for one. */
export function requestPlan(mode: PlanMode): boolean {
  if (handler) {
    handler(mode);
    return true;
  }
  pending = mode;
  return false;
}

/** A screen that can preview a plan registers here; a waiting request is handed over at once. Returns the cleanup. */
export function registerPlanHandler(h: Handler): () => void {
  handler = h;
  if (pending) {
    const mode = pending;
    pending = null;
    h(mode);
  }
  return () => {
    if (handler === h) handler = null;
  };
}

/** For tests. */
export function resetPlanRequests(): void {
  handler = null;
  pending = null;
}
