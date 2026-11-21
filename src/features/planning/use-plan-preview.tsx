"use client";
// The shell's side of Plan my day: whether a preview is open, the drawing it
// hands the timeline, and the lazy island itself. The scheduler and the panel
// stay out of the first download (SYSTEM_DESIGN.md §11.6): the island is
// fetched in idle time after the first paint and mounted when a plan is asked
// for, by the button, the palette or Cmd+Shift+P. The state itself is
// use-plan-preview-state.ts, which the Android app holds too.
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import type { PlanMode } from "./drawing";
import { usePlanPreviewState, type PlanPreviewState } from "./use-plan-preview-state";

export type { PlanPreviewState } from "./use-plan-preview-state";

const loadIsland = () => import("./plan-island");

export const LazyPlanIsland = dynamic(() => loadIsland().then((m) => m.PlanIsland), { ssr: false, loading: Opening });

function Opening() {
  return <p className="rounded-xl border border-line bg-surface px-5 py-4 text-body text-ink-3">Planning your day…</p>;
}

/** `onOpen` runs when a preview opens (the Today page switches to the Day view and lets go of a selected block). */
export function usePlanPreview(onOpen?: (mode: PlanMode) => void): PlanPreviewState {
  useEffect(() => preloadOnIdle(loadIsland), []);
  return usePlanPreviewState(onOpen);
}
