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

/**
 * Both stacks, twenty deep each. A new write clears the redo stack; an undo whose entry cannot be redone clears it
 * too, since nothing older may be made again on top of a change that stays undone. Undo and redo run one at a time,
 * in order, so each reads its rows after the one before has written them; an undo overtaken by a write while it ran
 * leaves no redo behind. `changed` hears every change of either stack.
 */
export class UndoHistory {
  private undos: UndoEntry[] = [];
  private redos: RedoItem[] = [];
  private writes = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly changed: (history: UndoHistory) => void = () => {},
    private readonly limit = UNDO_LIMIT,
  ) {}

  get canUndo(): boolean {
    return this.undos.length > 0;
  }

  get canRedo(): boolean {
    return this.redos.length > 0;
  }

  record(entry: UndoEntry): void {
    this.writes += 1;
    this.undos = push(this.undos, entry, this.limit);
    this.redos = [];
    this.changed(this);
  }

  /** Undoes the latest entry: resolves it and whether it went onto the redo stack, or null when there was nothing. */
  undo(): Promise<{ entry: UndoEntry; redoable: boolean } | null> {
    return this.serial(async () => {
      const { entry, rest } = pop(this.undos);
      if (!entry) return null;
      this.undos = rest;
      this.changed(this);
      const at = this.writes;
      const again = await entry.undo();
      const redoable = Boolean(again) && at === this.writes;
      this.redos = again && redoable ? push(this.redos, { entry, again }, this.limit) : [];
      this.changed(this);
      return { entry, redoable };
    });
  }

  /** Makes the latest undone entry again and puts it back on the undo stack: resolves it, or null when there was nothing. */
  redo(): Promise<UndoEntry | null> {
    return this.serial(async () => {
      const { entry: item, rest } = pop(this.redos);
      if (!item) return null;
      this.redos = rest;
      this.changed(this);
      await item.again.redo();
      const back = redone(item);
      this.undos = push(this.undos, back, this.limit);
      this.changed(this);
      return back;
    });
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

/** The toast after an undo, and what the live region says: "Undone: Dropped “Draft the proposal”". */
export const undoneWords = (entry: Pick<UndoEntry, "label">): string => `Undone: ${entry.label}`;
/** What the live region says after a redo: "Redone: Dropped “Draft the proposal”". */
export const redoneWords = (entry: Pick<UndoEntry, "label">): string => `Redone: ${entry.label}`;
