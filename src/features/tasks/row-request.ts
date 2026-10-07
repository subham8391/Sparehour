// The keyboard's way into a row (SCREENS.md §24): `.` opens the selected
// row's ⋯ menu and the palette's "Move to…" opens its day picker. The row the
// J/K selection is on listens while it is selected; the command asks, and
// learns whether a row answered, so it can fall back to the task's detail.
export type RowRequest = "menu" | "move";

type Listener = (id: string, request: RowRequest) => boolean;

const listeners = new Set<Listener>();

/** A row listens while it is selected; returns the cleanup. The listener says whether it took the request. */
export function listenForRowRequests(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Asks the row showing task `id` to open its menu or its day picker. True when one did. */
export function requestRow(id: string, request: RowRequest): boolean {
  for (const listener of listeners) if (listener(id, request)) return true;
  return false;
}
