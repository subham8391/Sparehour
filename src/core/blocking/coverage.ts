// What a task's blocks add up to (PRODUCT_SPEC.md §10.2 "Multiple blocks per task"): their minutes, overlaps
// counted once, and the quiet hint when that is not the estimate. Its own small module, because Today's row chip
// needs only this much of the blocking arithmetic in the first download. Minutes of the day; pure.
import type { Interval } from "../capacity";

/** The minutes several blocks cover, overlaps counted once. */
export function coveredMinutes(blocks: readonly Interval[]): number {
  let total = 0;
  let reach = -1;
  for (const b of [...blocks].sort((x, y) => x.start - y.start)) {
    const from = Math.max(b.start, reach);
    if (b.end > from) total += b.end - from;
    reach = Math.max(reach, b.end);
  }
  return total;
}

/**
 * How far a task's blocks fall short of, or run over, its estimate ("a mismatch shows a hint, never an error");
 * null when they match or there is no estimate to compare with.
 */
export function estimateMismatch(blockedMin: number, estimateMin: number | null): { kind: "short" | "over"; min: number } | null {
  if (estimateMin == null || blockedMin <= 0 || blockedMin === estimateMin) return null;
  return blockedMin < estimateMin ? { kind: "short", min: estimateMin - blockedMin } : { kind: "over", min: blockedMin - estimateMin };
}
