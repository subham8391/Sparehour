// What Today's hero card says, worked out from the shared capacity engine's own result (../../../src/core/capacity)
// by the web hero's own rule (../../../src/features/today/hero-state.ts). No sum is redone here: every figure is one
// the engine gave. Its own file, free of the screen, so it is tested plainly.
import type { Capacity } from "@/core/capacity";
import { formatMinutes } from "@/core/time";
import { heroState } from "@/features/today/hero-state";

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
  // Spare or over, and by how much: the web hero's own rule (a plan that spills past the day's end is over even when
  // the budget still looks generous), so Today, the Week tab and the web all say the same thing.
  const hero = heroState(cap);
  const planned = cap.committedMin + cap.unscheduledMin;
  const parts = [planned > 0 ? `${formatMinutes(planned)} planned` : "nothing planned yet"];
  if (cap.busyMin > 0) parts.push(`${formatMinutes(cap.busyMin)} in meetings`);
  if (hero.spill) parts.push(hero.spill);
  if (hero.finish) parts.push(hero.finish);
  const whole = Math.max(1, cap.workMin);
  const share = (minutes: number) => Math.max(0, Math.min(1, minutes / whole));
  return {
    kind: hero.over ? "over" : "spare",
    figure: formatMinutes(hero.min),
    line: parts.join(" · "),
    shares: { busy: share(cap.busyMin + cap.gapMin), planned: share(planned), buffer: share(cap.bufferMin), spare: hero.over ? 0 : share(cap.spareMin) },
  };
}
