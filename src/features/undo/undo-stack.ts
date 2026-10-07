// The undo and redo stacks (SCREENS.md §1 "Undo · Redo", §24 "Cmd+Z ·
// Cmd+Shift+Z", "Backspace: Drop (with an undo toast)"): every write records
// how to put things back, and undoing it hands back how to make it again. Pure.
import type { Redo } from "@/data/repositories/undo";

export type { Redo } from "@/data/repositories/undo";

export interface UndoEntry {
  /** Past tense, with the task's name: "Dropped “Draft the proposal”". */
  label: string;
  /** Whether to surface a toast with an Undo button. Silent entries still answer ⌘Z. */
  toast: boolean;
  /**
   * What the polite live region says instead of the label, with or without a toast: a drag's outcome in words
   * ("Moved “Draft the proposal” to 14:30–15:15", SYSTEM_DESIGN.md §11.5). A silent entry is announced only with one.
   */
  announce?: string;
  /** Takes the change back; resolves how to make it again (its redo), or nothing when it cannot be redone. */
  undo: () => Promise<Redo | void | undefined>;
}

/** An entry that was undone, waiting on the redo stack with the way back to it. */
export interface RedoItem {
  entry: UndoEntry;
  again: Redo;
}

export const UNDO_LIMIT = 20;

export function push<T>(stack: readonly T[], entry: T, limit = UNDO_LIMIT): T[] {
  return [...stack, entry].slice(-limit);
}

/** The latest entry and the stack without it. */
export function pop<T>(stack: readonly T[]): { entry: T | null; rest: T[] } {
  if (stack.length === 0) return { entry: null, rest: [] };
  return { entry: stack[stack.length - 1], rest: stack.slice(0, -1) };
}

/** A redone entry, back on the undo stack: undoing it again takes the redo back and offers it once more. */
export function redone(item: RedoItem): UndoEntry {
  return {
    ...item.entry,
    undo: async () => {
      await item.again.undo();
      return item.again;
    },
  };
}

/** The toast after an undo, and what the live region says: "Undone: Dropped “Draft the proposal”". */
export const undoneWords = (entry: Pick<UndoEntry, "label">): string => `Undone: ${entry.label}`;
/** What the live region says after a redo: "Redone: Dropped “Draft the proposal”". */
export const redoneWords = (entry: Pick<UndoEntry, "label">): string => `Redone: ${entry.label}`;
