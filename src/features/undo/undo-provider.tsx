"use client";
// Records every task write's inverse and offers it back: a toast with Undo
// for the ones a person might regret (drop, complete, move), ⌘Z for all.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { pop, push, type UndoEntry } from "./undo-stack";

export interface UndoSink {
  record: (entry: UndoEntry) => void;
}

interface UndoApi extends UndoSink {
  /** Undo the latest entry; resolves false when there was nothing to undo. */
  undo: () => Promise<boolean>;
  canUndo: boolean;
}

const UndoContext = createContext<UndoApi | null>(null);

/** The sink for repositories; null outside the provider (tests, scripts) so writes still work. */
export function useUndoSink(): UndoSink | null {
  return useContext(UndoContext);
}

/** The full API, or null outside the provider. */
export function useUndoOptional(): UndoApi | null {
  return useContext(UndoContext);
}

export function useUndo(): UndoApi {
  const api = useContext(UndoContext);
  if (!api) throw new Error("useUndo needs an UndoProvider above it");
  return api;
}

const TOAST_MS = 6000;

export function UndoProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<UndoEntry[]>([]);
  const [toast, setToast] = useState<UndoEntry | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((entry: UndoEntry | null) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(entry);
    if (entry) timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const record = useCallback(
    (entry: UndoEntry) => {
      setStack((s) => push(s, entry));
      if (entry.toast) showToast(entry);
    },
    [showToast],
  );

  const stackRef = useRef(stack);
  useEffect(() => {
    stackRef.current = stack;
  }, [stack]);

  const undo = useCallback(async () => {
    const { entry, rest } = pop(stackRef.current);
    if (!entry) return false;
    stackRef.current = rest;
    setStack(rest);
    showToast(null);
    await entry.undo();
    return true;
  }, [showToast]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const api = useMemo<UndoApi>(() => ({ record, undo, canUndo: stack.length > 0 }), [record, undo, stack.length]);

  return (
    <UndoContext.Provider value={api}>
      {children}
      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] z-30 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-ink px-4 py-3 text-[14px] text-paper shadow-lg sm:bottom-16">
          <span className="min-w-0 flex-1 truncate">{toast.label}</span>
          <button type="button" onClick={() => void undo()} className="flex h-9 items-center rounded-lg px-2 font-medium text-paper underline decoration-paper/50 hover:decoration-paper">
            Undo
          </button>
        </div>
      )}
    </UndoContext.Provider>
  );
}
