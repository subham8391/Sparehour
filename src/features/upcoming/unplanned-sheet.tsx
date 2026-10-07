"use client";
// The "Not yet planned" sheet (SCREENS.md §3 "Responsive"; DESIGN_SYSTEM.md
// §4a Upcoming): below the wide band the rail opens as a sheet, from the
// phone's strip pinned above the tab bar or the narrow and medium bands'
// button. Each task gets a day picker instead of a drag target: the next
// seven days with their bars, where a tap puts the task at the end of that
// day (one undoable write), then "Pick a date" for any other day. The row's
// ⋯ still offers Today, Tomorrow, Someday, the presets and Move to…. Lazy:
// the page fetches it in idle time and mounts it on the first open.
import { useState, type ReactNode } from "react";
import { compareDates, localDate, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { useLocalDatabase } from "@/data/powersync";
import { moveToDay } from "@/features/tasks/day-picker";
import { TaskList } from "@/features/tasks/task-row";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Button, buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { DateField } from "@/ui/date-field";
import { Icon } from "@/ui/icons";
import { Sheet } from "@/ui/sheet";
import { DayStrip, type StripDay } from "./day-strip";

export interface UnplannedSheetProps {
  tasks: readonly Task[];
  /** The next seven days from today, with their bars: what each task can be placed on at a tap. */
  days: readonly StripDay[];
  today: LocalDate;
  /** The task's row as the page draws it, with the picker as its footer. */
  row: (task: Task, footer: ReactNode) => ReactNode;
  onClose: () => void;
}

export function UnplannedSheet({ tasks, days, today, row, onClose }: UnplannedSheetProps) {
  const count = tasks.length;
  return (
    <Sheet label="Not yet planned" onClose={onClose} width="lg" className="max-h-[calc(100dvh-5rem)] sm:max-h-[80dvh]">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-2 sm:pt-4">
        <h2 className="font-display text-pane font-medium text-ink">
          Not yet planned <span className="text-ink-3 num">· {count}</span>
        </h2>
        <Button variant="icon" onClick={onClose} aria-label="Close" className="-mr-2">
          <Icon name="close" size={18} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-4">
        {count === 0 ? <p className="px-2 pb-2 text-body text-ink-2">Every task has a day.</p> : <p className="px-2 pb-2 text-body-sm text-ink-2">Tap a day to give a task its place in the week.</p>}
        {count > 0 && <TaskList>{tasks.map((t) => row(t, <PlaceTask task={t} days={days} today={today} />))}</TaskList>}
      </div>
    </Sheet>
  );
}

/** Under each task: the seven days, then "Pick a date" for any other one (the carry review's "Pick a day"). */
function PlaceTask({ task, days, today }: { task: Task; days: readonly StripDay[]; today: LocalDate }) {
  const db = useLocalDatabase();
  const repo = useTaskRepo();
  const [picking, setPicking] = useState(false);
  const place = (day: LocalDate) => void moveToDay(db, repo, task.id, day);
  return (
    <div className="flex flex-col gap-1 px-3 pb-2 sm:pr-4 sm:pl-11">
      <DayStrip days={days} size="pick" label={`Move “${task.title}” to`} onPick={(d) => place(d.day)} />
      <div className="flex min-h-7 items-center justify-end">
        {picking ? (
          <DateField
            aria-label={`Pick a date for ${task.title}`}
            placeholder="Choose a day"
            value=""
            today={today}
            min={today.toString()}
            autoFocus
            onChange={(e) => {
              if (!e.target.value) return;
              const day = localDate(e.target.value);
              if (compareDates(day, today) >= 0) place(day);
            }}
          />
        ) : (
          // 44 px on the phone, pulled into the line's spacing so the strip and the next row keep their rhythm.
          <button type="button" onClick={() => setPicking(true)} className={cx(buttonClass({ variant: "link", size: "compact" }), "text-ink-2 max-sm:-my-2")}>
            Pick a date
          </button>
        )}
      </div>
    </div>
  );
}
