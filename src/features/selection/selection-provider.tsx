"use client";
// One selected row per view, shared with the keyboard layer, plus the rows
// ticked for a bulk edit. A view registers its rows in order; the selection
// survives re-renders and moves to the neighbour when its row leaves.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { EMPTY_SELECTION, checkAll, checkRange, clearChecks, move, reconcile, select, toggleCheck, type SelectionState } from "./selection";

type Action =
  | { type: "register"; ids: readonly string[]; groups?: readonly (readonly string[])[] }
  | { type: "select"; id: string | null }
  | { type: "move"; delta: 1 | -1 }
  | { type: "toggle"; id: string }
  | { type: "range"; id: string }
  | { type: "all" }
  | { type: "clear" };

function reducer(state: SelectionState, action: Action): SelectionState {
  switch (action.type) {
    case "register":
      return reconcile(state, action.ids, action.groups);
    case "select":
      return select(state, action.id);
    case "move":
      return move(state, action.delta);
    case "toggle":
      return toggleCheck(state, action.id);
    case "range":
      return checkRange(state, action.id);
    case "all":
      return checkAll(state);
    case "clear":
      return clearChecks(state);
  }
}

interface SelectionApi {
  selectedId: string | null;
  /** The view's first row: the list's one Tab stop while nothing is selected (roving tabindex, SCREENS.md §1 rule 1). */
  firstId: string | null;
  /** Rows ticked for a bulk edit, in display order; empty means single-row mode. */
  checkedIds: readonly string[];
  select: (id: string | null) => void;
  moveSelection: (delta: 1 | -1) => void;
  toggleCheck: (id: string) => void;
  checkRange: (id: string) => void;
  checkAll: () => void;
  clearChecks: () => void;
  register: (ids: readonly string[], groups?: readonly (readonly string[])[]) => void;
}

const SelectionContext = createContext<SelectionApi | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY_SELECTION);
  // Stable callbacks: views register their rows in effects keyed on these,
  // so a changing identity would clear and re-register on every selection.
  const select = useCallback((id: string | null) => dispatch({ type: "select", id }), []);
  const moveSelection = useCallback((delta: 1 | -1) => dispatch({ type: "move", delta }), []);
  const toggle = useCallback((id: string) => dispatch({ type: "toggle", id }), []);
  const range = useCallback((id: string) => dispatch({ type: "range", id }), []);
  const all = useCallback(() => dispatch({ type: "all" }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  const register = useCallback((ids: readonly string[], groups?: readonly (readonly string[])[]) => dispatch({ type: "register", ids, groups }), []);
  const api = useMemo<SelectionApi>(
    () => ({ selectedId: state.selectedId, firstId: state.ids[0] ?? null, checkedIds: state.checked, select, moveSelection, toggleCheck: toggle, checkRange: range, checkAll: all, clearChecks: clear, register }),
    [state.selectedId, state.ids, state.checked, select, moveSelection, toggle, range, all, clear, register],
  );
  return <SelectionContext.Provider value={api}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionApi {
  const api = useContext(SelectionContext);
  if (!api) throw new Error("useSelection needs a SelectionProvider above it");
  return api;
}

/** The selection where a row may render without the provider (tests, previews). */
export function useSelectionOptional(): SelectionApi | null {
  return useContext(SelectionContext);
}

/**
 * A view calls this with its row ids in display order — as one list, or as
 * its sections (each a run of ids, in order) so Cmd+A can work on one.
 * Returns the selected id and a selector for rows. Registration is keyed on
 * the joined ids so an unchanged list does not re-dispatch.
 */
export function useListSelection(idsOrGroups: readonly string[] | readonly (readonly string[])[]): { selectedId: string | null; select: (id: string | null) => void } {
  const { selectedId, select: choose, register } = useSelection();
  const groups = (idsOrGroups.length > 0 && Array.isArray(idsOrGroups[0]) ? idsOrGroups : [idsOrGroups]) as readonly (readonly string[])[];
  const key = groups.map((g) => g.join(" ")).join("|");
  useEffect(() => {
    const parsed = key === "" ? [] : key.split("|").map((g) => (g === "" ? [] : g.split(" ")));
    register(parsed.flat(), parsed);
  }, [key, register]);
  useEffect(() => () => register([]), [register]);
  const select = useCallback((id: string | null) => choose(id), [choose]);
  return { selectedId, select };
}
