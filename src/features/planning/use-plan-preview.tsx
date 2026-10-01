"use client";
// The shell's side of Plan my day: whether a preview is open, the drawing it
// hands the timeline, and the lazy island itself. The scheduler and the panel
// stay out of the first download (SYSTEM_DESIGN.md §11.6): the island is
// fetched in idle time after the first paint and mounted when a plan is asked
// for, by the button, the palette or Cmd+Shift+P.
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { sameDrawing, type PlanDrawing, type PlanMode } from "./drawing";
import { registerPlanHandler } from "./plan-request";

const loadIsland = () => import("./plan-island");

export const LazyPlanIsland = dynamic(() => loadIsland().then((m) => m.PlanIsland), { ssr: false, loading: Opening });

function Opening() {
  return <p className="rounded-xl border border-line bg-surface px-5 py-4 text-body text-ink-3">Planning your day…</p>;
}

export interface PlanPreviewState {
  mode: PlanMode | null;
  open: (mode: PlanMode) => void;
  close: () => void;
  drawing: PlanDrawing | null;
  setDrawing: (drawing: PlanDrawing | null) => void;
}

/** `onOpen` runs when a preview opens (the Today page switches to the Day view and lets go of a selected block). */
export function usePlanPreview(onOpen?: (mode: PlanMode) => void): PlanPreviewState {
  const [mode, setMode] = useState<PlanMode | null>(null);
  const [drawing, setDrawingState] = useState<PlanDrawing | null>(null);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  });
  useEffect(() => preloadOnIdle(loadIsland), []);
  useEffect(
    () =>
      registerPlanHandler((m) => {
        setMode(m);
        onOpenRef.current?.(m);
      }),
    [],
  );
  return {
    mode,
    open: (m) => {
      setMode(m);
      onOpen?.(m);
    },
    close: () => {
      setMode(null);
      setDrawingState(null);
    },
    drawing: mode ? drawing : null,
    setDrawing: (next) => setDrawingState((prev) => (sameDrawing(prev, next) ? prev : next)),
  };
}
