"use client";
// The undo context alone: what a write records into, with none of the screen parts that offer it back (the toast,
// ⌘Z; undo-provider.tsx). Its own module so the hooks that only write (use-task-repo.ts, and Today's data hook
// through it) carry no web screen, and the Android app can use them as they are (docs/mobile/ANDROID_APP_SPEC.md §4).
import { createContext, useContext } from "react";
import type { UndoRecord } from "@/data/repositories/undo";
import type { UndoEntry } from "./undo-stack";

export interface UndoSink {
  /** A repository's record (the rows it declares make it redoable), or a screen's own entry (its undo resolves its redo). */
  record: (entry: UndoEntry | UndoRecord) => void;
}

export interface UndoApi extends UndoSink {
  /** Undo the latest entry; resolves false when there was nothing to undo. */
  undo: () => Promise<boolean>;
  /** Make the latest undone entry again; resolves false when there was nothing to redo. */
  redo: () => Promise<boolean>;
  canUndo: boolean;
  canRedo: boolean;
}

export const UndoContext = createContext<UndoApi | null>(null);

/** The sink for repositories; null outside the provider (tests, scripts) so writes still work. */
export function useUndoSink(): UndoSink | null {
  return useContext(UndoContext);
}
