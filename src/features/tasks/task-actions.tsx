"use client";
// The row-level move actions shared by the inbox, carried-over and Someday
// lists: plain text buttons, the primary one in ink, ≥ 44 px tall.
import type { DayChip } from "./day-chip";

const BTN = "flex min-h-11 items-center px-1.5 text-[13px]";

export function MoveActions({
  onToday,
  onTomorrow,
  onSomeday,
  onDrop,
}: {
  onToday?: () => void;
  onTomorrow?: () => void;
  onSomeday?: () => void;
  onDrop?: () => void;
}) {
  return (
    <span className="-my-2 flex shrink-0 items-center gap-0.5 text-ink-2">
      {onToday && (
        <button type="button" className={`${BTN} font-medium text-ink`} onClick={onToday}>
          Today
        </button>
      )}
      {onTomorrow && (
        <button type="button" className={BTN} onClick={onTomorrow}>
          Tomorrow
        </button>
      )}
      {onSomeday && (
        <button type="button" className={BTN} onClick={onSomeday}>
          Someday
        </button>
      )}
      {onDrop && (
        <button type="button" className={BTN} onClick={onDrop}>
          Drop
        </button>
      )}
    </span>
  );
}

const TONE: Record<DayChip["tone"], string> = {
  neutral: "bg-surface-2 text-ink-2",
  carried: "bg-over-soft text-over",
  parked: "bg-surface-2 text-ink-3",
};

export function DayChipTag({ chip }: { chip: DayChip | null }) {
  if (!chip) return null;
  return <span className={`rounded-md px-2 py-0.5 font-mono text-xs ${TONE[chip.tone]}`}>{chip.label}</span>;
}
