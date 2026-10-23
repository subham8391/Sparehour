"use client";
// The task detail's blocks (SCREENS.md §10 "Blocked 9:30–10:15 · locked"; DECISIONS.md "a tap alternative for
// every drag"): one field row per block from today on, which opens start and end fields that move or resize it,
// Lock and Remove — a sheet on the phone, a popover above it, reachable by a screen reader like any other field.
// Under them, when the blocks and the estimate disagree, a quiet line says by how much (PRODUCT_SPEC.md §10.2:
// a hint, never an error). Every change is the timeline's own write (BlockRepo.move), so it is undone and pushed
// to Google the same way. Rides in the detail's island.
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@/data/powersync";
import { coveredMinutes, estimateMismatch } from "@/core/blocking/coverage";
import { compareDates, formatMinutes, formatTime, instant, timeFromMinutes, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { normaliseTimestamp } from "@/data/mappers";
import type { TimeBlockRow } from "@/data/schema.client";
import { FieldRow } from "@/features/tasks/task-detail-panel";
import { instantAt, minutesOfField } from "./minutes";
import { Button } from "@/ui/button";
import { TimeField } from "@/ui/time-field";
import { useBlockRepo } from "./use-block-repo";

export const TASK_BLOCKS_SQL = `
  select * from time_blocks
  where task_id = ? and deleted_at is null and substr(end_at, 1, 10) >= ?
  order by start_at`;

export interface TaskBlock {
  id: string;
  day: LocalDate;
  start: number;
  end: number;
  locked: boolean;
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
    return [{ id: r.id, day, start: s.hour * 60 + s.minute, end, locked: r.locked === 1 }];
  });
}

const hm = (m: number) => (m >= 24 * 60 ? "24:00" : formatTime(timeFromMinutes(m)));

export function BlockRows({ taskId, estimateMin, zone, today }: { taskId: string; estimateMin: number | null; zone: string; today: LocalDate }) {
  const { data } = useQuery<TimeBlockRow>(TASK_BLOCKS_SQL, [taskId, today.subtract({ days: 1 }).toString()]);
  const blocks = useMemo(() => taskBlocks(data ?? [], zone, today), [data, zone, today]);
  const repo = useBlockRepo();
  if (blocks.length === 0) return null;
  const todays = blocks.filter((b) => b.day.equals(today));
  const off = estimateMismatch(coveredMinutes(todays), todays.length > 0 ? estimateMin : null);
  return (
    <>
      {blocks.map((b) => (
        <FieldRow
          key={b.id}
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
      ))}
      {off && (
        <p className="px-4 py-2.5 text-body-sm text-ink-3 sm:px-5" data-testid="block-estimate-hint">
          {formatMinutes(coveredMinutes(todays))} blocked · {formatMinutes(off.min)} {off.kind === "short" ? "short of" : "over"} the {formatMinutes(estimateMin ?? 0)} estimate
        </p>
      )}
    </>
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
