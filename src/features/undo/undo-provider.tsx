"use client";
// Records every write's inverse and offers it back: a toast with Undo for the
// ones a person might regret (drop, complete, move), ⌘Z for all. Undoing one
// keeps the way to make it again: ⇧⌘Z (Ctrl+Y), the palette's Redo, and the
// toast that confirms the undo (DECISIONS.md "Redo"). A new write clears it.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocalDatabase, type LocalDatabase } from "@/data/powersync";
import type * as RedoCapture from "@/data/repositories/redo-capture";
import type { UndoRecord } from "@/data/repositories/undo";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { Button } from "@/ui/button";
import { Toast } from "@/ui/toast";
import { UndoHistory, redoneWords, undoneWords, type UndoEntry } from "./undo-stack";

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

// The generic redo's capture (redo-capture.ts) is not needed to draw anything: fetched in idle time, out of every
// shell's first download (SYSTEM_DESIGN.md §11.6). Once it is in, a write is made redoable as it is recorded; one
// recorded sooner goes on the stack at once and is made redoable the moment the capture arrives (its undo waits for
// that).
let capture: typeof RedoCapture | null = null;
const loadRedo = () => import("@/data/repositories/redo-capture").then((m) => (capture = m));

/** A repository's record as a redoable entry. */
function redoableEntry(db: LocalDatabase, raw: UndoRecord): UndoEntry {
  if (capture) return capture.redoable(db, raw);
  const made = loadRedo().then((m) => m.redoable(db, raw));
  made.catch(() => undefined);
  return {
    label: raw.label,
    toast: raw.toast,
    ...(raw.announce ? { announce: raw.announce } : {}),
    undo: async () => {
      const entry = await made.catch(() => null);
      if (entry) return entry.undo();
      // No capture to be had (offline before it ever loaded): the write is still undone, just not redoable.
      await raw.undo();
      return undefined;
    },
  };
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
  const [depth, setDepth] = useState({ canUndo: false, canRedo: false });
  // The context changes only when either answer flips, so the screens' repositories are not rebuilt on every write.
  const [history] = useState(() => new UndoHistory((h) => setDepth((d) => (d.canUndo === h.canUndo && d.canRedo === h.canRedo ? d : { canUndo: h.canUndo, canRedo: h.canRedo }))));
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

  const record = useCallback(
    (raw: UndoEntry | UndoRecord) => {
      const entry: UndoEntry = "rows" in raw ? (db ? redoableEntry(db, raw) : { label: raw.label, toast: raw.toast, announce: raw.announce, undo: raw.undo }) : raw;
      history.record(entry);
      if (entry.toast) showToast({ text: entry.label, action: "Undo" });
      const words = entry.announce ?? (entry.toast ? entry.label : "");
      if (words) say(words);
    },
    [db, history, showToast, say],
  );

  const undo = useCallback(async () => {
    if (!history.canUndo) return false;
    showToast(null);
    setSaid("");
    const done = await history.undo();
    if (!done) return false;
    if (done.redoable) {
      // The touch path to Redo (DECISIONS.md "Redo"): the undo is confirmed in a toast that offers it, for ten seconds.
      showToast({ text: undoneWords(done.entry), action: "Redo" });
      say(undoneWords(done.entry));
    }
    return true;
  }, [history, showToast, say]);

  const redo = useCallback(async () => {
    if (!history.canRedo) return false;
    showToast(null);
    const back = await history.redo();
    if (!back) return false;
    if (back.toast) showToast({ text: back.label, action: "Undo" });
    say(redoneWords(back));
    return true;
  }, [history, showToast, say]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  useEffect(() => preloadOnIdle(loadRedo), []);

  const api = useMemo<UndoApi>(() => ({ record, undo, redo, canUndo: depth.canUndo, canRedo: depth.canRedo }), [record, undo, redo, depth]);

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
