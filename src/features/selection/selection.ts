// The list selection model (SCREENS.md §1 "Keyboard focus model", §24 "List
// and selection"): selection ≠ focus; one selected row per view, moved with
// J/K, kept when the row list changes where possible. On top of it, rows can
// be ticked for a bulk edit (X, Shift-click, long-press); ticked rows are
// what the selected-task commands act on while any are ticked. Pure.

export interface SelectionState {
  /** Row ids of the current view, in display order. */
  ids: readonly string[];
  selectedId: string | null;
  /** Rows ticked for a bulk edit, in display order. */
  checked: readonly string[];
}

export const EMPTY_SELECTION: SelectionState = { ids: [], selectedId: null, checked: [] };

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
 * the next keystroke keeps working; clear when the list is empty. Ticks on
 * rows that left are dropped.
 */
export function reconcile(state: SelectionState, ids: readonly string[]): SelectionState {
  const checked = state.checked.filter((id) => ids.includes(id));
  if (state.selectedId && ids.includes(state.selectedId)) return { ids, selectedId: state.selectedId, checked };
  if (!state.selectedId || ids.length === 0) return { ids, selectedId: null, checked };
  const oldIndex = state.ids.indexOf(state.selectedId);
  if (oldIndex === -1) return { ids, selectedId: null, checked };
  return { ids, selectedId: ids[Math.min(oldIndex, ids.length - 1)], checked };
}

const inDisplayOrder = (state: SelectionState, set: ReadonlySet<string>): string[] => state.ids.filter((id) => set.has(id));

/** X / the row's checkbox / long-press: tick or untick one row. */
export function toggleCheck(state: SelectionState, id: string): SelectionState {
  if (!state.ids.includes(id)) return state;
  const set = new Set(state.checked);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return { ...state, checked: inDisplayOrder(state, set) };
}

/** Cmd+A: every row in the view. */
export function checkAll(state: SelectionState): SelectionState {
  return { ...state, checked: [...state.ids] };
}

export function clearChecks(state: SelectionState): SelectionState {
  return state.checked.length === 0 ? state : { ...state, checked: [] };
}

/**
 * Shift-click: ticks every row from the anchor — the keyboard selection, or
 * failing that the last ticked row — to `id`, inclusive, and moves the
 * selection to the clicked row.
 */
export function checkRange(state: SelectionState, id: string): SelectionState {
  const to = state.ids.indexOf(id);
  if (to === -1) return state;
  const anchorId = state.selectedId ?? state.checked[state.checked.length - 1] ?? id;
  const from = Math.max(0, state.ids.indexOf(anchorId));
  const set = new Set(state.checked);
  for (let i = Math.min(from, to); i <= Math.max(from, to); i++) set.add(state.ids[i]);
  return { ...state, selectedId: id, checked: inDisplayOrder(state, set) };
}
