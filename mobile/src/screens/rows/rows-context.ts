// What a task row asks of the screen it is on (the web's rows ask its shell the same way: the selection provider,
// the row's lazy islands, the organising island): to open its ⋯ menu, to tick it for a bulk edit, and to run the
// menu's own Tomorrow and Someday when a swipe asks for them. A screen's frame answers (rows-frame.tsx). Outside one
// (a preview, a sheet, a screen not wired yet) a row is only drawn: no menu of the frame's, no ticks, no swipe.
import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { RowAction } from "./row-menu";

/** A row asking for its menu: the task, what its view offers for it, and the ring's action when it has one. */
export interface MenuRequest {
  task: Task;
  own: readonly RowAction[];
  lead?: readonly RowAction[];
  /** The ring's check-off; left out where the row cannot be completed (a finished one, a read-only one). */
  onComplete?: () => void;
  /** Converts the task to a project: the long hint's "Break it down". */
  onBreakDown?: () => void;
}

/** One revealed button of a swipe. */
export interface SwipeButton {
  label: string;
  run: () => void;
}

export interface SwipeProps {
  /** The finger moved right: these show at the row's left edge, the first what a full swipe runs. */
  right: readonly SwipeButton[];
  left: readonly SwipeButton[];
  /** False while rows are being ticked: a row being selected does not swipe. */
  enabled: boolean;
  children: ReactNode;
}

export interface RowsApi {
  /** The day the screen stands on, for which swipes a row offers. */
  today: LocalDate;
  openMenu: (request: MenuRequest) => void;
  /** Rows ticked for a bulk edit, in the order they stand. */
  checkedIds: readonly string[];
  toggleCheck: (id: string) => void;
  clearChecks: () => void;
  /** Bulk mode with nothing ticked yet: a view's "Select" (the Inbox's, SCREENS.md §5) shows every row's checkbox, as a long-press does. */
  selecting: boolean;
  setSelecting: (on: boolean) => void;
  /** A row on screen says so, so its tick is let go when it leaves; returns the way to say it left. */
  mount: (id: string) => () => void;
  /** The menu's own Tomorrow and Someday, for an open row's swipe: the same writes as its ⋯ items. */
  runTomorrow: (task: Task) => void;
  runSomeday: (task: Task) => void;
  /** The gesture itself (swipe-row.tsx), handed in by the screen so a row drawn without one never loads it. */
  Swipe: ComponentType<SwipeProps> | null;
}

export const RowsContext = createContext<RowsApi | null>(null);

/** The frame the row is in, or null outside one. */
export function useRows(): RowsApi | null {
  return useContext(RowsContext);
}
