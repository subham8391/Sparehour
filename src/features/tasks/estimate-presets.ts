// The estimate presets (PRODUCT_SPEC.md §9.2): 15m · 30m · 45m · 1h · 1h 30m · 2h · 3h · 4h, plus minutes typed in.
// One list for every picker that offers them: the row's chip, the detail's Estimate field, E and the bulk bar.
import { formatMinutes } from "@/core/time";

export const ESTIMATE_PRESETS: readonly number[] = [15, 30, 45, 60, 90, 120, 180, 240];

/** What the dashed chip of a task without an estimate says on hover, focus and to a screen reader. */
export function guessLabel(defaultMin: number): string {
  return `No estimate — counted as ${formatMinutes(defaultMin)}`;
}
