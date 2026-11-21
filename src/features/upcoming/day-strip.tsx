"use client";
// The phone's 7-day strip (SCREENS.md §3 "Responsive", DESIGN_SYSTEM.md §4a
// Upcoming): one cell per day with its weekday, its date and the 6 px
// capacity bar, today ringed in ink. Pinned over the agenda, a tap jumps to
// the day; under a task in the "Not yet planned" sheet, a tap places the task
// there. Seven cells always fit across 360 px at 44 px each, so nothing
// scrolls sideways. Each cell says its day and readout in words for
// assistive tech ("Thu 17, 20 minutes over"); the bar itself is hidden.
import { weekdayName } from "@/core/time/format-day";
import { cx } from "@/ui/cx";
import { stripCellName, type StripDay } from "./agenda";
import { DayBar } from "./capacity-bar";

// The cell's type and its spoken names live in agenda.ts, free of this file's screen parts; they are handed on from
// here so every import of them from the strip stays as it was.
export { spokenMinutes, spokenReadout, stripCellName, type StripDay } from "./agenda";

export function DayStrip({
  days,
  label,
  onPick,
  isDisabled,
  size = "strip",
  className,
}: {
  days: readonly StripDay[];
  /** The group's name: "Jump to a day", or "Move “X” to". */
  label: string;
  onPick: (day: StripDay) => void;
  /** A day with nothing to jump to (gone, and empty): shown, quieter, and not a target. */
  isDisabled?: (day: StripDay) => boolean;
  /** `strip` is the pinned strip's taller cell with the date in the display face; `pick` the compact one under a task. */
  size?: "strip" | "pick";
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cx("grid grid-cols-7", className)}>
      {days.map((d) => {
        const off = isDisabled?.(d) ?? false;
        return (
          <button
            key={d.day.toString()}
            type="button"
            aria-label={stripCellName(d)}
            aria-current={d.isToday ? "date" : undefined}
            aria-disabled={off || undefined}
            data-strip-day={d.day.toString()}
            onClick={() => {
              if (!off) onPick(d);
            }}
            className={cx(
              // 44 px wide at 360 px (seven across 320 px of content), 44 px tall or more; the drawn tile sits inside it.
              "flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 transition-[background-color,transform] dur-fast hover:bg-hover active:bg-press motion-safe:active:scale-97",
              size === "strip" ? "min-h-14 py-1.5" : "min-h-11 py-1",
              d.isToday && "shadow-[inset_0_0_0_1.5px_var(--ink)]",
              off && "pointer-events-none opacity-50",
            )}
          >
            <span className={cx("text-micro font-semibold uppercase tracking-eyebrow", d.isToday ? "text-ink" : "text-ink-3")}>{weekdayName(d.day)}</span>
            <span className={cx("leading-none text-ink num", size === "strip" ? "font-display text-pane" : "text-body-sm font-medium")}>{d.day.day}</span>
            {d.capacity && d.readout ? <DayBar c={d.capacity} readout={d.readout} className="w-full max-w-9" /> : <span aria-hidden="true" className="h-1.5" />}
          </button>
        );
      })}
    </div>
  );
}
