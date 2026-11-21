"use client";
// The Plan my day preview, wired to the local database: the task ages and the
// days ahead for the score, the block repository for Approve (one transaction,
// one undo entry, then the push-after-write path to Google like any block),
// and the task repository for Didn't fit's Tomorrow and Someday. Loaded as a
// next/dynamic island so the scheduler stays out of Today's first download.
// The wiring itself is use-plan-wiring.ts, which the Android app uses too.
import type { Instant } from "@/core/time";
import type { PlanDrawing, PlanMode } from "./drawing";
import type { PlanModel } from "./plan-input";
import { PlanPreview } from "./plan-preview";
import { usePlanWiring } from "./use-plan-wiring";

export interface PlanIslandProps {
  mode: PlanMode;
  model: PlanModel;
  now: Instant;
  layout: "dock" | "inline";
  onDrawing?: (drawing: PlanDrawing | null) => void;
  onClose: () => void;
}

export function PlanIsland({ mode, model, now, layout, onDrawing, onClose }: PlanIslandProps) {
  const wiring = usePlanWiring(model, now);
  return <PlanPreview mode={mode} base={wiring.base} blockTitles={wiring.blockTitles} layout={layout} writer={wiring.writer} toIso={wiring.toIso} onDrawing={onDrawing} onClose={onClose} paused={wiring.paused} />;
}
