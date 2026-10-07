// A screen's own undoable change of a value, with its redo (DECISIONS.md "Redo"). Its own module: only Settings and
// the first run use it, so the shells' undo stack does not carry it.
import type { Redo, UndoEntry } from "./undo-stack";

/**
 * A screen's own change of a value (a setting, a day's working hours, this device's motion choice): undoing writes
 * the old value back over the new one, redoing writes the new one again. `write(to, from)` makes the change.
 */
export function valueEntry<T>(label: string, write: (to: T, from: T) => unknown, before: T, after: T): UndoEntry {
  const again: Redo = {
    redo: async () => void (await write(after, before)),
    undo: async () => void (await write(before, after)),
  };
  return {
    label,
    toast: false,
    undo: async () => {
      await again.undo();
      return again;
    },
  };
}
