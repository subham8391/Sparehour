// Plan my day on the phone, wired (SCREENS.md §2.6a; the web's is features/planning/plan-island.tsx): the day, the
// task ages, the days ahead, the block repository behind Approve (one transaction, `source = 'plan'`, one undo, then
// on to the calendar like any block) and the task repository behind Tomorrow and Someday are the web's own wiring,
// used as it is (../../../../src/features/planning/use-plan-wiring.ts). The panel is plan-preview-view.tsx. Must sit
// under <BlockWrites>, as every screen does.
import type { Instant } from "@/core/time";
import type { PlanDrawing, PlanMode } from "@/features/planning/drawing";
import type { PlanModel } from "@/features/planning/plan-input";
import { usePlanWiring } from "@/features/planning/use-plan-wiring";
import { PlanPreviewPanel, type PlanLayout } from "./plan-preview-view";

export interface PlanMyDayProps {
  mode: PlanMode;
  /** Today, as useToday gives it. */
  model: PlanModel;
  now: Instant;
  layout: PlanLayout;
  /** The proposal as the timeline draws it: what it leaves free, and the plan's earlier blocks it replaces. */
  onDrawing?: (drawing: PlanDrawing | null) => void;
  onClose: () => void;
  onHeight?: (height: number) => void;
}

export function PlanMyDay({ mode, model, now, layout, onDrawing, onClose, onHeight }: PlanMyDayProps) {
  const wiring = usePlanWiring(model, now);
  return <PlanPreviewPanel mode={mode} base={wiring.base} blockTitles={wiring.blockTitles} layout={layout} writer={wiring.writer} toIso={wiring.toIso} onDrawing={onDrawing} onClose={onClose} paused={wiring.paused} onHeight={onHeight} />;
}
