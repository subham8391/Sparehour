"use client";
// The phone's FAB shows only on task lists (DECISIONS.md 2026-09-18, phone
// rules). The route settles most of that (`showsQuickAdd`); a view that turns
// into something else in place asks the shell to hide it while it does —
// Today's Day view, whose free gaps are the targets a tap schedules into and
// which the FAB would otherwise sit on.
import { createContext, useContext, useEffect, type Dispatch, type SetStateAction } from "react";

/** The shell's setter for "a view has asked the FAB to step aside"; null outside the shell. */
export const FabRoomContext = createContext<Dispatch<SetStateAction<boolean>> | null>(null);

/** While `hidden` is true the shell hides the FAB; it comes back when the view stops asking or unmounts. */
export function useHideQuickAddFab(hidden: boolean): void {
  const setHidden = useContext(FabRoomContext);
  useEffect(() => {
    if (!setHidden) return;
    setHidden(hidden);
    return () => setHidden(false);
  }, [setHidden, hidden]);
}
