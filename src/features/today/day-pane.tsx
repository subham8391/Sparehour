"use client";
// "Your day" (SCREENS.md §2.6): the pane's heading, the tap-to-schedule bar, the timeline and its first-use hint.
// An island out of Today's first download (SYSTEM_DESIGN.md §11.6): the page starts fetching it as it mounts,
// while the local database opens, so it is in memory by the time there is a day to draw — and the timeline's
// growth (zoom, block editing, the toolbar's Move… and Duplicate, blocks of your own) lands here rather than in
// the shell. The wiring from the shared placing hook to the timeline lives here for the same reason.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@/data/powersync";
import { formatTime, timeFromMinutes } from "@/core/time";
import type { Task } from "@/core/types";
import { chooseSlot } from "@/core/blocking";
import { onAddBlock } from "@/features/blocking/add-block-request";
import { usePlacing, type PlacingApi, type PlacingDay } from "@/features/blocking/use-placing";
import { PENDING_BLOCKS_SQL, blockSync } from "./block-sync";
import { pausedLine, useCalendarState } from "./calendar-state";
import { requestTimeline } from "./timeline-request";
import { PlacingBar, Timeline, type TimelineProps } from "./timeline";

/** What the screen draws; the placing hook supplies everything a person can do on it. */
export type DrawnDay = Pick<TimelineProps, "c" | "now" | "zone" | "blocks" | "proposed" | "meetings" | "shownMeeting" | "defaultEstimateMin" | "paneScrolls">;

/**
 * The timeline's handlers, from the placing hook: the same writes, and the same Google push, on every path. With
 * blocking paused (`off`, PRODUCT_SPEC.md §10.3 rule 5) nothing new lands — no drop, no drawn block, no copy, no
 * tap-to-place — while the blocks already there can still be moved, locked, renamed or removed.
 */
export function placerTimeline(placer: PlacingApi, findTask: (id: string) => Task | undefined, onOpenTask: (taskId: string) => void, off: string | null = null): Omit<TimelineProps, keyof DrawnDay> {
  const handlers: Omit<TimelineProps, keyof DrawnDay> = {
    selectedBlockId: placer.selectedBlockId,
    onSelectBlock: placer.setSelectedBlockId,
    onDropTask: (taskId, startMin) => {
      const task = findTask(taskId);
      if (task) void placer.placeTask(task, startMin);
    },
    onMoveBlock: placer.moveBlock,
    onResizeBlock: placer.resizeBlock,
    onDuplicateBlock: (id, startMin) => void placer.duplicateBlock(id, startMin),
    onRemoveBlock: placer.removeBlock,
    onToggleLock: (id, locked) => void placer.repo.setLocked(id, locked),
    onRenameBlock: (id, title) => void placer.repo.rename(id, title),
    onCreateBlock: placer.createAdHoc,
    onOpenTask,
    placing: placer.placingTask ? { title: placer.placingTask.title } : null,
    onTapSlot: placer.tapSlot,
  };
  if (!off) return handlers;
  return { ...handlers, onDropTask: undefined, onCreateBlock: undefined, onDuplicateBlock: undefined, onTapSlot: undefined, placing: null };
}

export interface DayPaneProps {
  /** The working day the heading names, in minutes of the day. */
  start: number;
  end: number;
  bufferPct: number | undefined;
  /** Nothing on the timeline yet, nothing being placed and no preview open: say how blocks get there. */
  hint: boolean;
  /** The day the placing hook works on, with the selection and the waiting task the page holds. */
  placing: PlacingDay;
  onOpenTask: (taskId: string) => void;
  timeline: DrawnDay;
  /** A day that has passed (Today stepped back, DECISIONS.md "Today on another day"): its blocks and meetings, drawn only. */
  readOnly?: boolean;
}

export function DayPane(p: DayPaneProps) {
  // Whether blocks reach Google, and whether blocking is paused (access revoked, write calendar gone).
  const { writes } = useCalendarState();
  // The "will sync" and "not synced" marks (SCREENS.md §2.7, §21): a block change still in the upload queue, or one
  // Google has not had yet, or every block while blocking is paused — on whichever day is drawn.
  const { data: pendingRows } = useQuery<{ id: string | null }>(PENDING_BLOCKS_SQL);
  const blocks = useMemo(() => {
    const waitingIds = new Set((pendingRows ?? []).flatMap((r) => (r.id ? [r.id] : [])));
    return p.timeline.blocks?.map((b) => ({ ...b, sync: blockSync(b, waitingIds, writes) }));
  }, [p.timeline.blocks, pendingRows, writes]);
  const drawn = { ...p.timeline, blocks };
  // Nothing places, moves or answers `B` on a day that has passed, so the placing hook is not even mounted.
  return p.readOnly ? <PaneFrame {...p} timeline={<Timeline {...drawn} />} /> : <PlacingPane {...p} drawn={drawn} off={pausedLine(writes.off)} />;
}

function PlacingPane({ drawn, off, ...p }: DayPaneProps & { drawn: DrawnDay; off: string | null }) {
  // B, drops, moves, copies and blocks of your own: here, so none of it rides in Today's first download. Blocking
  // paused refuses new blocks on any day placed from here, today or a later one.
  const placer = usePlacing({ ...p.placing, off });
  const waiting = off ? undefined : placer.placingTask;
  // A row's "Block" while blocking is paused lands here, where the line says why; nothing stays armed.
  const armed = Boolean(off && placer.placingTask);
  useEffect(() => {
    if (armed) placer.setPlacing(null);
  }, [armed, placer]);
  useAddBlock(p.placing, placer, off);
  return (
    <PaneFrame
      {...p}
      hint={p.hint && !off}
      note={off}
      // Tap-to-schedule (SCREENS.md §2.8): the task waiting for a time, and how to let go of it.
      bar={waiting && <PlacingBar text={`Tap a time for “${waiting.title}”`} onCancel={() => placer.setPlacing(null)} />}
      timeline={<Timeline {...drawn} {...placerTimeline(placer, p.placing.findTask, p.onOpenTask, off)} />}
    />
  );
}

/**
 * The palette's "Add time block" (DECISIONS.md "Palette Add tag and Add time block"): an untitled 30-minute block of
 * your own in the next free gap from now (`B`'s chooser), selected, with its title open to rename once it is drawn.
 * Only while the pane shows today; with blocking paused nothing is made, and the pane's line says why.
 */
function useAddBlock(day: PlacingDay, placer: PlacingApi, off: string | null) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const add = useRef(() => {});
  useEffect(() => {
    add.current = () => {
      if (off || day.nowMinute === null) return;
      day.onPlaced?.();
      const slot = chooseSlot(day.free, Math.max(day.nowMinute, day.dayStart), 30, day.dayEnd);
      void placer.createAdHoc(slot.start, Math.min(slot.end, slot.start + 30)).then((id) => id && setRenaming(id));
    };
  });
  const today = day.nowMinute !== null;
  useEffect(() => (today ? onAddBlock(() => add.current()) : undefined), [today]);
  // The new block is drawn and selected a beat after the write: then its title opens for renaming.
  const drawn = Boolean(renaming && placer.selectedBlockId === renaming && day.blocks.some((b) => b.id === renaming));
  useEffect(() => {
    if (!drawn) return;
    setRenaming(null);
    requestTimeline("rename-block");
  }, [drawn]);
}

function PaneFrame({ start, end, bufferPct, hint, note, bar, timeline }: Pick<DayPaneProps, "start" | "end" | "bufferPct" | "hint"> & { note?: string | null; bar?: ReactNode; timeline: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface bg-daylight px-4 pt-4 pb-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:bg-none lg:p-0">
      <h2 className="font-display text-pane font-medium text-ink">Your day</h2>
      <p className="mt-1 mb-4.5 text-body-sm text-ink-3 num">
        {formatTime(timeFromMinutes(start))} – {formatTime(timeFromMinutes(end))} · buffer {bufferPct}%
      </p>
      {/* Blocking paused (PRODUCT_SPEC.md §10.3 rule 5): why, where the drop would have been; today's banner above the ribbon fixes it. */}
      {note && (
        <p role="note" className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-body-sm text-pretty text-ink-2">
          {note}
        </p>
      )}
      {bar}
      {timeline}
      {hint && (
        <p className="mt-4 text-body-sm text-pretty text-ink-3">
          <span className="max-sm:hidden">Drag a task here, tap “Block” on a row and then a time, or select a task and press B. Drag on an empty stretch for a block of your own.</span>
          <span className="sm:hidden">Tap “Block” on a task, then a time here — or tap an empty time for a block of your own.</span>
        </p>
      )}
    </div>
  );
}
