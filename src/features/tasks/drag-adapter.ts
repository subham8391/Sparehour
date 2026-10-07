// The Pragmatic element adapter for task rows (SYSTEM_DESIGN.md §11.6): every list shell draws rows, and the
// adapter is the biggest thing a row needs that its first paint does not, so it stays out of the first download, as
// the sidebar's drag does (nav-drag-island.tsx). Today starts it as the page mounts, alongside the local database
// opening; elsewhere the first row to mount starts it. A row is wired up the moment it has arrived, before the
// lists have their rows on a first open, and at once after that: the module is then already in memory.
import type * as Adapter from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";

export type DragAdapter = typeof Adapter;

let adapter: Promise<DragAdapter> | null = null;

/** The adapter, fetched once per page load; a failed fetch is tried again by the next row that asks. */
export function loadDragAdapter(): Promise<DragAdapter> {
  adapter ??= import("@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter").catch((e: unknown) => {
    adapter = null;
    throw e;
  });
  return adapter;
}

/** Wires `wire` up once the adapter is in; returns the cleanup for `useEffect`, which also stops a wiring still waiting. */
export function withDragAdapter(wire: (adapter: DragAdapter) => () => void): () => void {
  let live = true;
  let cleanup: (() => void) | null = null;
  loadDragAdapter().then(
    (a) => {
      if (live) cleanup = wire(a);
    },
    () => undefined, // no adapter (offline before it ever loaded): the row stays put; its menus still move it
  );
  return () => {
    live = false;
    cleanup?.();
  };
}
