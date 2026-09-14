// The list selection model (SCREENS.md §1 "Keyboard focus model"):
// selection ≠ focus; one selected row per view, moved with J/K, kept when
// the row list changes where possible. Pure.

export interface SelectionState {
  /** Row ids of the current view, in display order. */
  ids: readonly string[];
  selectedId: string | null;
}

export function select(state: SelectionState, id: string | null): SelectionState {
  if (id !== null && !state.ids.includes(id)) return state;
  return { ...state, selectedId: id };
}

/** J/K: step through the list; from nothing, J selects the first and K the last. */
export function move(state: SelectionState, delta: 1 | -1): SelectionState {
  if (state.ids.length === 0) return { ...state, selectedId: null };
  const at = state.selectedId ? state.ids.indexOf(state.selectedId) : -1;
  if (at === -1) return { ...state, selectedId: delta === 1 ? state.ids[0] : state.ids[state.ids.length - 1] };
  const next = Math.min(state.ids.length - 1, Math.max(0, at + delta));
  return { ...state, selectedId: state.ids[next] };
}

/**
 * The view re-rendered with a new list: keep the selection if the row is
 * still there; if it left (completed, moved), select what took its place so
 * the next keystroke keeps working; clear when the list is empty.
 */
export function reconcile(state: SelectionState, ids: readonly string[]): SelectionState {
  if (state.selectedId && ids.includes(state.selectedId)) return { ids, selectedId: state.selectedId };
  if (!state.selectedId || ids.length === 0) return { ids, selectedId: null };
  const oldIndex = state.ids.indexOf(state.selectedId);
  if (oldIndex === -1) return { ids, selectedId: null };
  return { ids, selectedId: ids[Math.min(oldIndex, ids.length - 1)] };
}
