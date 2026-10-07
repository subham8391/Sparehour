"use client";
// Records every task write's inverse and offers it back: a toast with Undo
// for the ones a person might regret (drop, complete, move), ⌘Z for all.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/ui/button";
import { Toast } from "@/ui/toast";
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

/** Ten seconds to change your mind (PRODUCT_SPEC.md §7 rule 3, SCREENS.md §19); hovering or focusing the toast holds it. */
const TOAST_MS = 10_000;

export function UndoProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<UndoEntry[]>([]);
  const [toast, setToast] = useState<UndoEntry | null>(null);
  /** The live region's words: the entry's announcement, else a toast's label. The same words again get a trailing space so they are read again. */
  const [said, setSaid] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((entry: UndoEntry | null) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(entry);
    if (entry) timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  // A toast under the pointer or holding focus waits; it gets its full time back once left alone (WCAG 2.2.1).
  const holdToast = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const releaseToast = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const record = useCallback(
    (entry: UndoEntry) => {
      setStack((s) => push(s, entry));
      if (entry.toast) showToast(entry);
      const words = entry.announce ?? (entry.toast ? entry.label : "");
      if (words) setSaid((s) => (s === words ? `${words}\u00a0` : words));
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
    setSaid("");
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
      {/* The announcement lives in one region that is always on the page and only changes its words: a live region
          inserted already filled is not read by many screen readers (VoiceOver on iOS among them). The visual toast
          below keeps its role but stays quiet, so nothing is read twice. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {said}
      </div>
      {toast && (
        <Toast
          aria-live="off"
          key={toast.label}
          onMouseEnter={holdToast}
          onMouseLeave={releaseToast}
          onFocus={holdToast}
          onBlur={releaseToast}
          action={
            <Button variant="quiet" size="auto" className="px-3" onClick={() => void undo()}>
              Undo
            </Button>
          }
        >
          {toast.label}
        </Toast>
      )}
    </UndoContext.Provider>
  );
}
