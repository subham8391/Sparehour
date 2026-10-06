"use client";
// "Your day" (SCREENS.md §2.6): the pane's heading, the tap-to-schedule bar, the timeline and its first-use hint.
// An island out of Today's first download (SYSTEM_DESIGN.md §11.6): the page starts fetching it as it mounts,
// while the local database opens, so it is in memory by the time there is a day to draw — and the timeline's
// later growth (zoom, block editing) lands here rather than in the shell.
import { formatTime, timeFromMinutes } from "@/core/time";
import { Timeline, type TimelineProps } from "./timeline";

export interface DayPaneProps {
  /** The working day the heading names, in minutes of the day. */
  start: number;
  end: number;
  bufferPct: number | undefined;
  /** Tap-to-schedule (SCREENS.md §2.8): the task waiting for a time, and how to let go of it. */
  placing: { title: string; onCancel: () => void } | null;
  /** Nothing on the timeline yet, nothing being placed and no preview open: say how blocks get there. */
  hint: boolean;
  timeline: TimelineProps;
}

export function DayPane({ start, end, bufferPct, placing, hint, timeline }: DayPaneProps) {
  return (
    <div className="rounded-xl border border-line bg-surface bg-daylight px-4 pt-4 pb-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:bg-none lg:p-0">
      <h2 className="font-display text-pane font-medium text-ink">Your day</h2>
      <p className="mt-1 mb-4.5 text-body-sm text-ink-3 num">
        {formatTime(timeFromMinutes(start))} – {formatTime(timeFromMinutes(end))} · buffer {bufferPct}%
      </p>
      {placing && (
        <div role="status" className="mb-3 flex min-h-11 items-center justify-between gap-3 rounded-lg bg-ink px-3 py-1.5 text-body-sm text-ink-inverse sm:min-h-9">
          <span className="min-w-0 truncate">Tap a time for “{placing.title}”</span>
          <button type="button" onClick={placing.onCancel} className="flex h-11 shrink-0 items-center rounded-sm px-2 font-medium underline decoration-ink-inverse/50 hover:decoration-ink-inverse sm:h-7">
            Cancel
          </button>
        </div>
      )}
      <Timeline {...timeline} />
      {hint && (
        <p className="mt-4 text-body-sm text-pretty text-ink-3">
          <span className="max-sm:hidden">Drag a task here, tap “Block” on a row and then a time, or select a task and press B.</span>
          <span className="sm:hidden">Tap “Block” on a task, then a time here.</span>
        </p>
      )}
    </div>
  );
}
