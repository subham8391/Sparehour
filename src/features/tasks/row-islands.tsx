"use client";
// The row ⋯ menu's lazy parts (SYSTEM_DESIGN.md §11.6): every shell draws task
// rows, so the snooze group, the day picker and the estimate presets stay out of
// the first download.
// Both are fetched in idle time after the first row paints; until the menu's
// group has arrived, a menu shows the row's own actions alone.
import dynamic from "next/dynamic";
import { Suspense, lazy, type ReactNode } from "react";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";

const loadRowMenu = () => import("./row-menu");
const loadDayPicker = () => import("./day-picker");
const loadEstimate = () => import("./estimate-popover");
const loadSwipe = () => import("./swipe-layer");

const RowMenuLazy = lazy(() => loadRowMenu().then((m) => ({ default: m.RowMenu })));

/** The row's actions (after the view's `lead`), then the snooze presets and Move to… once they have loaded. */
export function RowMenuIsland({ taskId, lead, children }: { taskId: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <Suspense fallback={<>{lead}{children}</>}>
      <RowMenuLazy taskId={taskId} lead={lead}>{children}</RowMenuLazy>
    </Suspense>
  );
}

export const DayPickerIsland = dynamic(() => loadDayPicker().then((m) => m.DayPicker), { ssr: false });

/** The estimate chip's presets (estimate-popover.tsx), fetched when a chip is first clicked or E pressed. */
export const EstimateIsland = dynamic(() => loadEstimate().then((m) => m.EstimatePopover), { ssr: false });

let preloaded = false;

/** A row's swipe (swipe-layer.tsx), mounted by the row's first touch. */
export const SwipeIsland = dynamic(() => loadSwipe().then((m) => m.SwipeLayer), { ssr: false });

/** Once per page load, whichever row mounts first: both parts in idle time, and the swipe on a device that cannot hover. */
export function preloadRowIslands(): void {
  if (preloaded) return;
  preloaded = true;
  const touch = typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
  preloadOnIdle(() => Promise.all([loadRowMenu(), loadDayPicker(), touch && loadSwipe()]));
}
