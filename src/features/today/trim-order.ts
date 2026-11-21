// Trim today's rules (PRODUCT_SPEC.md §9.4): the order the panel lists today's tasks in, its readout, and how long
// "Now fits" stays. None of the panel's drawing (trim-today.tsx), so the Android app's sheet lists and says the
// same (docs/mobile/ANDROID_APP_SPEC.md §4).
import { formatMinutes } from "@/core/time";
import type { Task } from "@/core/types";

/** How long "Now fits" stays before the panel closes itself. */
export const FITS_CLOSE_MS = 1200;

/** The tasks as the panel lists them: largest estimate first, the hand order between equals. */
export function trimOrder(tasks: readonly Task[], defaultEstimateMin: number): Task[] {
  const at = new Map(tasks.map((t, i) => [t.id, i]));
  return [...tasks].sort((a, b) => (b.estimateMin ?? defaultEstimateMin) - (a.estimateMin ?? defaultEstimateMin) || (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0));
}

/** The readout: "40m more than fits", or "Now fits". */
export const trimReadout = (overMin: number): string => (overMin > 0 ? `${formatMinutes(overMin)} more than fits` : "Now fits");
