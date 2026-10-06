"use client";
// Review of what the rollover filed to Someday on its own (SCREENS.md §7,
// PRODUCT_SPEC.md §8.4): one task at a time, full screen on the phone and a
// dialog above it. Keep in Someday · Today · Pick a date · Drop, each one
// tap, then the next task. Loaded on demand (next/dynamic), so it is not in
// the Someday route's first download.
import { useState } from "react";
import { instant, localDate, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { normaliseTimestamp } from "@/data/mappers";
import type { TaskRow } from "@/data/schema.client";
import { useLocalDatabase } from "@/data/powersync";
import { SomedayRepo } from "@/data/repositories/someday-repo";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Button, iconButtonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { DateField } from "@/ui/date-field";
import { Icon } from "@/ui/icons";
import { Sheet } from "@/ui/sheet";

export function SomedayReview({
  tasks,
  today,
  zone,
  projectNames,
  onClose,
}: {
  tasks: readonly TaskRow[];
  today: LocalDate;
  zone: string;
  projectNames: ReadonlyMap<string, string>;
  onClose: () => void;
}) {
  const repo = useTaskRepo();
  const db = useLocalDatabase();
  // The walk is over the batch as it was when it opened: each answer takes a task out of the live group.
  const [batch] = useState(() => [...tasks]);
  const [index, setIndex] = useState(0);
  const task = batch[index];
  const next = () => setIndex((i) => i + 1);
  const answer = (act: () => Promise<void>) => () => void act().then(next);

  const touched = task?.last_touched_at ? instant(normaliseTimestamp(task.last_touched_at)).toZonedDateTimeISO(zone).toPlainDate() : null;
  return (
    <Sheet label="Review what moved to Someday" onClose={onClose} width="sm" align="center" className="max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none">
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 pt-2 pb-5 sm:pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-body-sm text-ink-2 num">{task ? `${index + 1} of ${batch.length}` : "Reviewed"}</p>
          <button type="button" aria-label="Close" onClick={onClose} className={cx(iconButtonClass({ size: "auto" }), "-mr-2")}>
            <Icon name="close" size={18} />
          </button>
        </div>
        {task ? (
          <>
            <div className="flex flex-1 flex-col gap-2 sm:flex-none">
              <h2 className="font-display text-pane font-medium text-balance text-ink">{task.title}</h2>
              <p className="text-body-sm text-ink-2">
                {[task.project_id ? projectNames.get(task.project_id) : null, touched ? `Last touched ${formatDay(touched, { today })}` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="primary" onClick={answer(() => new SomedayRepo(db).keep([task.id]))}>
                Keep in Someday
              </Button>
              <Button onClick={answer(() => repo.reschedule(task.id, today))}>Today</Button>
              <DateField
                aria-label={`Pick a date for ${task.title}`}
                placeholder="Pick a date"
                value=""
                today={today}
                min={today.toString()}
                className="w-full"
                onChange={(e) => e.target.value && void repo.reschedule(task.id, localDate(e.target.value)).then(next)}
              />
              <Button onClick={answer(() => repo.setState(task.id, "dropped"))}>Drop</Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col gap-4 sm:flex-none">
            <p className="font-display text-pane font-medium text-ink">That&rsquo;s all of them.</p>
            <Button variant="primary" className="self-start" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
