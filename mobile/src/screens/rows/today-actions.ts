// What Today's rows offer, by section (the web's are in app/(app)/today/page.tsx): a carried-over row moves to Today
// · Tomorrow · Someday · Drop; a row of the day moves up or down while the list is in the hand's order, goes to
// Tomorrow (not on tomorrow itself) and can be blocked; every one converts to a project. Today's own screen holds
// the handlers (today.tsx), so it hands them down through this context and its sections (today/sections.tsx) read
// them here; without it, a section's ⋯ asks Today's view as it did before.
import { createContext, useContext } from "react";
import type { Task } from "@/core/types";
import { moveActions, type RowAction } from "./row-menu";

type On = (task: Task) => void;

/** Today's row handlers; one left out is not offered (Tomorrow on tomorrow itself, Move up while a sort holds the rows). */
export interface TodayRowHandlers {
  onToday?: On;
  onTomorrow?: On;
  onSomeday?: On;
  onDrop?: On;
  /** "Convert to project", and the long hint's "Break it down". */
  onConvert?: On;
  onMoveUp?: On;
  onMoveDown?: On;
  /** "Block": the task then waits for a tap on the timeline. */
  onBlock?: On;
}

export type TodaySection = "carried" | "day" | "evening";

export const TodayRowsContext = createContext<TodayRowHandlers | null>(null);

export function useTodayRowHandlers(): TodayRowHandlers | null {
  return useContext(TodayRowsContext);
}

/** The row's own actions for its section, in the web's order. */
export function todayRowActions(section: TodaySection, task: Task, on: TodayRowHandlers): RowAction[] {
  const one = (label: string, run: On | undefined, text?: string): RowAction[] => (run ? [{ label, text, run: () => run(task) }] : []);
  const bind = (run: On | undefined) => (run ? () => run(task) : undefined);
  const convert = one("Convert to project", on.onConvert);
  if (section === "carried") return [...moveActions({ onToday: bind(on.onToday), onTomorrow: bind(on.onTomorrow), onSomeday: bind(on.onSomeday), onDrop: bind(on.onDrop) }), ...convert];
  if (section === "evening") return convert;
  // The whole word names the task for a screen reader; the menu shows "Block" (WCAG 2.5.3).
  return [...one("Move up", on.onMoveUp), ...one("Move down", on.onMoveDown), ...one("Tomorrow", on.onTomorrow), ...one(`Block ${task.title}`, on.onBlock, "Block"), ...convert];
}
