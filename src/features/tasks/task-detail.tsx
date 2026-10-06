"use client";
// The task detail's place in the shell: which task is open, and where it
// appears (context pane, right sheet, full-screen sheet). The detail itself,
// wired to the local database, is task-detail-connected.tsx.
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { cx } from "@/ui/cx";
import { Grabber, Scrim, trapTab, useDialogFocus } from "@/ui/sheet";

// The panel brings the recurrence engine with it, and its wiring the queries
// and repositories only an open task needs, so both stay out of the shell's
// first download (SYSTEM_DESIGN.md §11.6): fetched in idle time after the
// first paint, mounted when a task is opened.
const loadPanel = () => import("./task-detail-connected");
const TaskDetail = dynamic(() => loadPanel().then((m) => m.TaskDetail), { ssr: false, loading: Opening });

export function Opening() {
  return <div className="p-5 text-body text-ink-3">Opening…</div>;
}

interface TaskDetailApi {
  selectedId: string | null;
  open: (id: string) => void;
  close: () => void;
}

const TaskDetailContext = createContext<TaskDetailApi | null>(null);

export function useTaskDetail(): TaskDetailApi {
  const api = useContext(TaskDetailContext);
  if (!api) throw new Error("useTaskDetail needs a TaskDetailProvider above it");
  return api;
}

export function TaskDetailProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const open = useCallback((id: string) => setSelectedId(id), []);
  const close = useCallback(() => setSelectedId(null), []);
  const api = useMemo(() => ({ selectedId, open, close }), [selectedId, open, close]);
  useEffect(() => preloadOnIdle(loadPanel), []);
  return <TaskDetailContext.Provider value={api}>{children}</TaskDetailContext.Provider>;
}

/**
 * The context pane (medium band and up), a right-side sheet (narrow) or a
 * full-height sheet with a grabber (phone). Mounted once by the shell; empty
 * until a task is opened. Escape closes it unless a popover inside claimed
 * the key first. The pane appears at once; the sheets slide in from their
 * edge (DESIGN_SYSTEM.md §7 "Sheets"), or simply appear under reduced motion.
 */
export function TaskDetailPane() {
  const { selectedId, close } = useTaskDetail();
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, close]);

  if (!selectedId) return null;
  return <DetailSurface id={selectedId} onClose={close} />;
}

const OVERLAY_QUERY = "(max-width: 47.9375rem)";
const subscribeOverlay = (onChange: () => void) => {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(OVERLAY_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const readOverlay = () => typeof window.matchMedia === "function" && window.matchMedia(OVERLAY_QUERY).matches;

/**
 * Below `md` the detail covers the list (a full-screen sheet on the phone, a side sheet in the narrow band), so it
 * is a modal dialog there: focus moves in, stays in, and goes back to the row on close (SCREENS.md §1 rules 5 and 6).
 * From `md` up it is a pane beside the list, and focus stays where the person is working.
 */
function DetailSurface({ id, onClose }: { id: string; onClose: () => void }) {
  const overlay = useSyncExternalStore(subscribeOverlay, readOverlay, () => false);
  const surface = useDialogFocus<HTMLElement>(overlay);
  return (
    <>
      <Scrim onClose={onClose} className="fixed z-20 md:hidden" />
      <aside
        ref={surface}
        aria-label="Task"
        role={overlay ? "dialog" : undefined}
        aria-modal={overlay ? true : undefined}
        tabIndex={overlay ? -1 : undefined}
        onKeyDown={overlay ? trapTab : undefined}
        className={cx(
          "fixed inset-0 z-30 flex flex-col bg-surface pt-[env(safe-area-inset-top)] outline-none",
          // The phone sheet rises from the bottom, the narrow band's from the right; the pane from `md` up just appears.
          "max-md:transition-[translate,opacity] max-md:dur-slow max-md:ease-drawer max-sm:starting:translate-y-full sm:max-md:starting:translate-x-full",
          "sm:left-auto sm:w-[420px] sm:border-l sm:border-line sm:pt-0 sm:shadow-sheet md:sticky md:top-0 md:inset-auto md:z-auto md:h-dvh md:w-96 md:shrink-0 md:shadow-none",
        )}
      >
        <Grabber />
        <TaskDetail key={id} id={id} onClose={onClose} />
      </aside>
    </>
  );
}
