// Keys whose meaning belongs to the view on screen (SCREENS.md §24): `[` and
// `]` step a dated view (a week in Upcoming), `T` with nothing selected goes
// back to its first page, `←` / `→` move the selected task a day where days
// sit side by side, and `J` / `K` may stay inside a column. The registry
// binds the keys; the view that gives them a meaning registers it here while
// it is mounted. A key with no handler does nothing, or what it always did.
export type ViewKey = "prev" | "next" | "home" | "earlier" | "later" | "down" | "up";

/** A handler returns false when it let the key pass (nothing to do here), so the default can run. */
export type ViewKeyHandlers = Partial<Record<ViewKey, (selectedId: string | null) => boolean | void>>;

let current: ViewKeyHandlers | null = null;

/** The view's handlers while it is mounted; returns the cleanup. */
export function registerViewKeys(handlers: ViewKeyHandlers): () => void {
  current = handlers;
  return () => {
    if (current === handlers) current = null;
  };
}

/** Runs the view's meaning for a key. True when a view took it. */
export function runViewKey(key: ViewKey, selectedId: string | null): boolean {
  const handler = current?.[key];
  return handler ? handler(selectedId) !== false : false;
}
