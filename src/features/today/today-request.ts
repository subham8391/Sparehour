// Palette commands that act on Today's own view (Trim today, Sort by…, Show
// completed; SCREENS.md §12 View): Today takes a request while it is
// mounted; anywhere else the request waits until Today opens, as Plan my day's
// does (features/planning/plan-request.ts).
import type { TodaySort } from "@/core/today/sort-options";

export type TodayRequest = { kind: "trim" } | { kind: "sort"; sort: TodaySort } | { kind: "completed" };
type Handler = (request: TodayRequest) => void;

let handler: Handler | null = null;
let pending: TodayRequest | null = null;

/** Hands the request to Today; returns false when Today is not open (it then waits for Today). */
export function requestToday(request: TodayRequest): boolean {
  if (handler) {
    handler(request);
    return true;
  }
  pending = request;
  return false;
}

/** Today registers here while mounted; a waiting request is handed over at once. Returns the cleanup. */
export function registerTodayHandler(h: Handler): () => void {
  handler = h;
  if (pending) {
    const r = pending;
    pending = null;
    h(r);
  }
  return () => {
    if (handler === h) handler = null;
  };
}

/** For tests. */
export function resetTodayRequests(): void {
  handler = null;
  pending = null;
}
