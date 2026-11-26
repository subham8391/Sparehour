"use client";
// The task detail's blocks (SCREENS.md §10 "Blocked 9:30–10:15 · locked"; DECISIONS.md "a tap alternative for
// every drag"): one field row per block from today on, which opens start and end fields that move or resize it,
// Lock and Remove — a sheet on the phone, a popover above it, reachable by a screen reader like any other field.
// Under them, when the blocks and the estimate disagree, a quiet line says by how much (PRODUCT_SPEC.md §10.2:
// a hint, never an error). Every change is the timeline's own write (BlockRepo.move), so it is undone and pushed
// to Google the same way. Under a block that has not started and whose reminder quiet hours will drop, a line says
// so, with the way to Settings › Notifications (docs/product/REMINDERS_AND_AI_SPEC.md §1: a note in ink-2, never
// red, never a popup). Rides in the detail's island.
import Link from "next/link";
import { Fragment, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@/data/powersync";
import { coveredMinutes, estimateMismatch } from "@/core/blocking/coverage";
import type { ReminderSettings } from "@/core/notifications/quiet-hours";
import { compareDates, formatMinutes, formatTime, instant, timeFromMinutes, type Instant, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { normaliseTimestamp } from "@/data/mappers";
import { TASK_BLOCKS_SQL } from "@/data/queries/blocks";
import type { TimeBlockRow } from "@/data/schema.client";
import { CHANGE_QUIET_HOURS, heldNote } from "@/features/notifications/held-reminders";
import { FieldRow } from "@/features/tasks/task-detail-panel";
import { instantAt, minutesOfField } from "./minutes";
import { Button, buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { TimeField } from "@/ui/time-field";
import { useBlockRepo } from "./use-block-repo";

export interface TaskBlock {
  id: string;
  day: LocalDate;
  start: number;
  end: number;
  locked: boolean;
  /** The row's own start, for what is asked of the moment itself (whether its reminder will come). */
  startAt: string;
}

/** The task's blocks from `today` on, as minutes of their local days; one that runs past midnight ends at 24:00. */
export function taskBlocks(rows: readonly TimeBlockRow[], zone: string, today: LocalDate): TaskBlock[] {
  return rows.flatMap((r) => {
    if (!r.start_at || !r.end_at) return [];
    const s = instant(normaliseTimestamp(r.start_at)).toZonedDateTimeISO(zone);
    const e = instant(normaliseTimestamp(r.end_at)).toZonedDateTimeISO(zone);
    const day = s.toPlainDate();
    if (compareDates(e.toPlainDate(), today) < 0) return [];
    const end = e.toPlainDate().equals(day) ? e.hour * 60 + e.minute : 24 * 60;
    return [{ id: r.id, day, start: s.hour * 60 + s.minute, end, locked: r.locked === 1, startAt: r.start_at }];
  });
}

const hm = (m: number) => (m >= 24 * 60 ? "24:00" : formatTime(timeFromMinutes(m)));

export function BlockRows({
  taskId,
  estimateMin,
  zone,
  today,
  now,
  reminders = null,
}: {
  taskId: string;
  estimateMin: number | null;
  zone: string;
  today: LocalDate;
  /** The moment, for which blocks have started; without it nothing is said about reminders. */
  now?: Instant;
  /** The person's reminder settings; null while they are not read, and for a task no reminder is made for (done, parked, dropped). */
  reminders?: ReminderSettings | null;
}) {
  const { data } = useQuery<TimeBlockRow>(TASK_BLOCKS_SQL, [taskId, today.subtract({ days: 1 }).toString()]);
  const blocks = useMemo(() => taskBlocks(data ?? [], zone, today), [data, zone, today]);
  const repo = useBlockRepo();
  if (blocks.length === 0) return null;
  const todays = blocks.filter((b) => b.day.equals(today));
  const off = estimateMismatch(coveredMinutes(todays), todays.length > 0 ? estimateMin : null);
  return (
    <>
      {blocks.map((b) => (
        <Fragment key={b.id}>
          <FieldRow
            label="Blocked"
            value={
              <span>
                {!b.day.equals(today) && `${formatDay(b.day, { today })} · `}
                {hm(b.start)}–{hm(b.end)}
                {b.locked && <span className="font-normal text-ink-3"> · locked</span>}
              </span>
            }
          >
            {(close) => (
              <BlockTimes
                block={b}
                onSave={(start, end) => {
                  void repo.move(b.id, instantAt(b.day, zone, start), instantAt(b.day, zone, end));
                  close();
                }}
                onLock={() => void repo.setLocked(b.id, !b.locked)}
                onRemove={() => {
                  void repo.remove(b.id);
                  close();
                }}
              />
            )}
          </FieldRow>
          <HeldNote words={now ? heldNote(b.startAt, now, zone, reminders) : null} />
        </Fragment>
      ))}
      {off && (
        <p className="px-4 py-2.5 text-body-sm text-ink-3 sm:px-5" data-testid="block-estimate-hint">
          {formatMinutes(coveredMinutes(todays))} blocked · {formatMinutes(off.min)} {off.kind === "short" ? "short of" : "over"} the {formatMinutes(estimateMin ?? 0)} estimate
        </p>
      )}
    </>
  );
}

/** Under a block whose reminder will not come: the rule's own sentence, and the way to change the quiet hours. */
function HeldNote({ words }: { words: string | null }) {
  if (!words) return null;
  return (
    <p className="flex min-h-11 flex-wrap items-center gap-x-1.5 px-4 py-1.5 text-body-sm text-ink-2 sm:px-5" data-testid="block-held-note">
      <span className="mr-auto">{words}</span>
      <Link href="/settings#notifications" className={cx(buttonClass({ variant: "link" }), "text-ink-2")}>
        {CHANGE_QUIET_HOURS}
      </Link>
    </p>
  );
}

/** Start and end fields for one block: a new start keeps the end, a new end keeps the start; locked, they wait for Unlock. */
function BlockTimes({ block, onSave, onLock, onRemove }: { block: TaskBlock; onSave: (start: number, end: number) => void; onLock: () => void; onRemove: () => void }) {
  const [from, setFrom] = useState(hm(block.start));
  const [to, setTo] = useState(hm(block.end === 24 * 60 ? 24 * 60 - 5 : block.end));
  const [error, setError] = useState<string | null>(null);
  const send = (e: FormEvent) => {
    e.preventDefault();
    const start = minutesOfField(from);
    const end = minutesOfField(to);
    if (start === null || end === null) return setError("Use a time like 09:30.");
    if (end <= start) return setError("It ends before it starts.");
    onSave(start, end);
  };
  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-body-sm text-ink-2">
          Starts
          <TimeField data-autofocus value={from} disabled={block.locked} onChange={(v) => (setFrom(v), setError(null))} aria-label="Block starts" />
        </label>
        <label className="flex items-center gap-2 text-body-sm text-ink-2">
          Ends
          <TimeField value={to} disabled={block.locked} onChange={(v) => (setTo(v), setError(null))} aria-label="Block ends" />
        </label>
      </div>
      {block.locked && <p className="text-body-sm text-ink-3">Locked — unlock it to change the time.</p>}
      {error && (
        <p role="alert" className="text-body-sm text-deadline">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {!block.locked && (
          <Button type="submit" variant="primary">
            Save
          </Button>
        )}
        <Button variant="secondary" onClick={onLock}>
          {block.locked ? "Unlock" : "Lock"}
        </Button>
        <Button variant="quiet" onClick={onRemove}>
          Remove block
        </Button>
      </div>
    </form>
  );
}
