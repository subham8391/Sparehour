// The undo stack (SCREENS.md §1 "Undo · Redo", §24 "Backspace: Drop (with an
// undo toast)"): every task write records how to put things back. Pure.

export interface UndoEntry {
  /** Past tense, with the task's name: "Dropped “Draft the proposal”". */
  label: string;
  /** Whether to surface a toast with an Undo button. Silent entries still answer ⌘Z. */
  toast: boolean;
  undo: () => Promise<void>;
}

export const UNDO_LIMIT = 20;

export function push(stack: readonly UndoEntry[], entry: UndoEntry, limit = UNDO_LIMIT): UndoEntry[] {
  return [...stack, entry].slice(-limit);
}

/** The latest entry and the stack without it. */
export function pop(stack: readonly UndoEntry[]): { entry: UndoEntry | null; rest: UndoEntry[] } {
  if (stack.length === 0) return { entry: null, rest: [] };
  return { entry: stack[stack.length - 1], rest: stack.slice(0, -1) };
}
