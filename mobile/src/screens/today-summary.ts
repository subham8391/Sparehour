// What Today's hero card says, worked out from the shared capacity engine's own result (../../../src/core/capacity).
// No sum is redone here: every figure is one the engine gave. Its own file, free of the screen, so it is tested plainly.
import type { Capacity } from "@/core/capacity";
import { formatMinutes, formatTime } from "@/core/time";

export type Summary =
  | { kind: "none"; line: string }
  | {
      kind: "spare" | "over";
      /** The figure, already in words: "6h 05m". */
      figure: string;
      /** What is beside it: "35m planned · 1h in meetings · done by 16:25". */
      line: string;
      /** The working day in four parts, each a share of 1, in the order they are drawn. */
      shares: { busy: number; planned: number; buffer: number; spare: number };
    };

export function todaySummary(cap: Capacity | null): Summary {
  if (cap === null) return { kind: "none", line: "" };
  if (cap.state === "no_work_day") return { kind: "none", line: cap.reason === "out_of_office" ? "Out of office today" : "No working hours today" };
  const planned = cap.committedMin + cap.unscheduledMin;
  const parts = [planned > 0 ? `${formatMinutes(planned)} planned` : "nothing planned yet"];
  if (cap.busyMin > 0) parts.push(`${formatMinutes(cap.busyMin)} in meetings`);
  if (cap.projectedFinish) parts.push(`done by ${formatTime(cap.projectedFinish)}`);
  const over = cap.overMin > 0;
  const whole = Math.max(1, cap.workMin);
  const share = (minutes: number) => Math.max(0, Math.min(1, minutes / whole));
  return {
    kind: over ? "over" : "spare",
    figure: formatMinutes(over ? cap.overMin : cap.spareMin),
    line: parts.join(" · "),
    shares: { busy: share(cap.busyMin + cap.gapMin), planned: share(planned), buffer: share(cap.bufferMin), spare: over ? 0 : share(cap.spareMin) },
  };
}
