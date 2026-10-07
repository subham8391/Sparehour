"use client";
// Records every write's inverse and offers it back: a toast with Undo for the
// ones a person might regret (drop, complete, move), ⌘Z for all. Undoing one
// keeps the way to make it again: ⇧⌘Z (Ctrl+Y), the palette's Redo, and the
// toast that confirms the undo (DECISIONS.md "Redo"). A new write clears it.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocalDatabase, type LocalDatabase } from "@/data/powersync";
import { redoable, type UndoRecord } from "@/data/repositories/undo";
import { Button } from "@/ui/button";
import { Toast } from "@/ui/toast";
import { pop, push, redone, redoneWords, undoneWords, type RedoItem, type UndoEntry } from "./undo-stack";

export interface UndoSink {
  /** A repository's record (the rows it declares make it redoable), or a screen's own entry (its undo resolves its redo). */
  record: (entry: UndoEntry | UndoRecord) => void;
}

interface UndoApi extends UndoSink {
  /** Undo the latest entry; resolves false when there was nothing to undo. */
  undo: () => Promise<boolean>;
  /** Make the latest undone entry again; resolves false when there was nothing to redo. */
  redo: () => Promise<boolean>;
  canUndo: boolean;
  canRedo: boolean;
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

/** The one toast on screen: a write's label with Undo, or an undo's confirmation with Redo. */
interface ToastState {
  text: string;
  action: "Undo" | "Redo";
}

export function UndoProvider({ children }: { children: ReactNode }) {
  // Outside the database provider (tests, the sign-in pages) there is none: entries still undo, without a redo.
  const db = useLocalDatabase() as LocalDatabase | null | undefined;
  const undos = useRef<UndoEntry[]>([]);
  const redos = useRef<RedoItem[]>([]);
  /** Counts writes: an undo still running when a new write lands must not leave a redo on top of it. */
  const writes = useRef(0);
  /** Undo and redo run one at a time, in order: each reads its rows after the one before has written. */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });
  const [toast, setToast] = useState<ToastState | null>(null);
  /** The live region's words: the entry's announcement, else a toast's label. The same words again get a trailing space so they are read again. */
  const [said, setSaid] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((next: ToastState | null) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(next);
    if (next) timer.current = setTimeout(() => setToast(null), TOAST_MS);
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
  const say = useCallback((words: string) => setSaid((s) => (s === words ? `${words} ` : words)), []);
  const settle = useCallback(() => setDepth({ undo: undos.current.length, redo: redos.current.length }), []);

  const record = useCallback(
    (raw: UndoEntry | UndoRecord) => {
      const entry: UndoEntry = "rows" in raw ? (db ? redoable(db, raw) : { label: raw.label, toast: raw.toast, announce: raw.announce, undo: raw.undo }) : raw;
      writes.current += 1;
      undos.current = push(undos.current, entry);
      redos.current = [];
      settle();
      if (entry.toast) showToast({ text: entry.label, action: "Undo" });
      const words = entry.announce ?? (entry.toast ? entry.label : "");
      if (words) say(words);
    },
    [db, showToast, say, settle],
  );

  const serial = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task, task);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const undo = useCallback(
    () =>
      serial(async () => {
        const { entry, rest } = pop(undos.current);
        if (!entry) return false;
        undos.current = rest;
        settle();
        showToast(null);
        setSaid("");
        const at = writes.current;
        const again = await entry.undo();
        if (again && at === writes.current) {
          redos.current = push(redos.current, { entry, again });
          // The touch path to Redo (DECISIONS.md "Redo"): the undo is confirmed in a toast that offers it, for ten seconds.
          showToast({ text: undoneWords(entry), action: "Redo" });
          say(undoneWords(entry));
        } else {
          // Not redoable, or overtaken by a newer write: nothing older can be made again on top of it.
          redos.current = [];
        }
        settle();
        return true;
      }),
    [serial, settle, showToast, say],
  );

  const redo = useCallback(
    () =>
      serial(async () => {
        const { entry: item, rest } = pop(redos.current);
        if (!item) return false;
        redos.current = rest;
        settle();
        showToast(null);
        await item.again.redo();
        const back = redone(item);
        undos.current = push(undos.current, back);
        settle();
        if (back.toast) showToast({ text: back.label, action: "Undo" });
        say(redoneWords(back));
        return true;
      }),
    [serial, settle, showToast, say],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const api = useMemo<UndoApi>(() => ({ record, undo, redo, canUndo: depth.undo > 0, canRedo: depth.redo > 0 }), [record, undo, redo, depth]);

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
          key={`${toast.action}:${toast.text}`}
          onMouseEnter={holdToast}
          onMouseLeave={releaseToast}
          onFocus={holdToast}
          onBlur={releaseToast}
          action={
            <Button variant="quiet" size="auto" className="px-3" onClick={() => void (toast.action === "Redo" ? redo() : undo())}>
              {toast.action}
            </Button>
          }
        >
          {toast.text}
        </Toast>
      )}
    </UndoContext.Provider>
  );
}
