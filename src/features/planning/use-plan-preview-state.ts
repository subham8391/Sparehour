"use client";
// Whether a Plan my day preview is open, and the drawing it hands the timeline: the state a screen that can show the
// preview holds (Today, the morning plan's last step). Free of the web's lazy island (use-plan-preview.tsx), so the
// Android app holds the same state (docs/mobile/ANDROID_APP_SPEC.md §4).
import { useEffect, useRef, useState } from "react";
import { sameDrawing, type PlanDrawing, type PlanMode } from "./drawing";
import { registerPlanHandler } from "./plan-request";

export interface PlanPreviewState {
  mode: PlanMode | null;
  open: (mode: PlanMode) => void;
  close: () => void;
  drawing: PlanDrawing | null;
  setDrawing: (drawing: PlanDrawing | null) => void;
}

/** `onOpen` runs when a preview opens (the Today page switches to the Day view and lets go of a selected block). */
export function usePlanPreviewState(onOpen?: (mode: PlanMode) => void): PlanPreviewState {
  const [mode, setMode] = useState<PlanMode | null>(null);
  const [drawing, setDrawingState] = useState<PlanDrawing | null>(null);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  });
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
