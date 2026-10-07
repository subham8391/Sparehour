"use client";
// The task detail's place in the shell: which task is open. Where it appears
// (context pane, right sheet, full-screen sheet) is task-detail-surface.tsx,
// and the detail itself, wired to the local database, task-detail-connected.tsx.
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";

// The surface, the panel (which brings the recurrence engine with it) and its
// wiring (the queries and repositories only an open task needs) all stay out of
// the shell's first download (SYSTEM_DESIGN.md §11.6): fetched in idle time
// after the first paint, mounted when a task is opened.
const loadSurface = () => import("./task-detail-surface");
const DetailSurface = dynamic(() => loadSurface().then((m) => m.DetailSurface), { ssr: false });

/** A field row whose picker can be opened directly (SCREENS.md §24: D, ⇧D, ⇧S, E, R). */
/** `pause` opens Repeat with its pause picker (Pause repeats until… in the palette). */
export type DetailField = "do" | "deadline" | "start" | "estimate" | "repeat" | "pause";

/** Which field's picker to open; `seq` grows with each ask, so asking again opens it again. */
export interface FieldRequest {
  name: DetailField;
  seq: number;
}

interface TaskDetailApi {
  selectedId: string | null;
  field: FieldRequest | null;
  /** Opens the task, with that field's picker open and focused when one is named. */
  open: (id: string, field?: DetailField) => void;
  close: () => void;
  /** Cmd+. (SCREENS.md §24): closes the open task, or opens the last one closed again, else `fallback` (the selected row). */
  toggle: (fallback?: string | null) => void;
}

const TaskDetailContext = createContext<TaskDetailApi | null>(null);

export function useTaskDetail(): TaskDetailApi {
  const api = useContext(TaskDetailContext);
  if (!api) throw new Error("useTaskDetail needs a TaskDetailProvider above it");
  return api;
}

export function TaskDetailProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [field, setField] = useState<FieldRequest | null>(null);
  // The task last open, for Cmd+. to bring back.
  const last = useRef<string | null>(null);
  const open = useCallback((id: string, name?: DetailField) => {
    last.current = id;
    setSelectedId(id);
    setField((f) => (name ? { name, seq: (f?.seq ?? 0) + 1 } : null));
  }, []);
  const close = useCallback(() => setSelectedId(null), []);
  const toggle = useCallback(
    (fallback?: string | null) => {
      const id = last.current ?? fallback;
      if (selectedId) close();
      else if (id) open(id);
    },
    [selectedId, close, open],
  );
  const api = useMemo(() => ({ selectedId, field, open, close, toggle }), [selectedId, field, open, close, toggle]);
  useEffect(() => preloadOnIdle(loadSurface), []);
  return <TaskDetailContext.Provider value={api}>{children}</TaskDetailContext.Provider>;
}

/** Mounted once by the shell; empty until a task is opened, then the surface (task-detail-surface.tsx). */
export function TaskDetailPane() {
  const { selectedId, field, close } = useTaskDetail();
  return selectedId && <DetailSurface id={selectedId} field={field} onClose={close} />;
}
