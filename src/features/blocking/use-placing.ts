"use client";
// Placing blocks on a day (PRODUCT_SPEC.md §10.2, SCREENS.md §2.6, §2.8): where a task's block goes and how long it
// is, `B`'s next free gap, tap-to-schedule and the block's own Move… and Duplicate (a tap on the timeline, or a
// time typed), the ad-hoc blocks drawn on empty space, and the selected block. Shared by Today and the morning
// plan's last step, and written for any day so the Calendar and day stepping can take it as they are.
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@/data/powersync";
import { blockLength, chooseSlot, coveredMinutes, placeAt, snapTo } from "@/core/blocking";
import type { Interval } from "@/core/capacity";
import type { LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { TimelineBlock } from "@/features/today/hooks/use-today";
import { useBlocking } from "./blocking-provider";
import { instantAt } from "./minutes";
import { useBlockRepo } from "./use-block-repo";

export { instantAt } from "./minutes";

const USER_SQL = `select id, personal_space_id from users limit 1`;

export interface PlacingDay {
  day: LocalDate;
  zone: string;
  blocks: readonly TimelineBlock[];
  /** The day's free gaps, what `B` looks in. */
  free: readonly Interval[];
  /** The working day, in minutes of the day; `B` starts no earlier than its start, and spills past its end. */
  dayStart: number;
  dayEnd: number;
  /** The minute it is now when `day` is today; null on any other day. */
  nowMinute: number | null;
  defaultEstimateMin: number;
  findTask: (id: string) => Task | undefined;
  /** Whatever the screen does when a block is placed for it by `B` (Today shows its Day view). */
  onPlaced?: () => void;
  /**
   * The selected block and the task waiting for a tap, when the screen holds them itself: Today keeps them in its
   * shell (a row's "Block…" and Plan my day set them) and runs this hook inside the day pane's island.
   */
  state?: PlacingState;
}

export interface PlacingState {
  selectedBlockId: string | null;
  setSelectedBlockId: Dispatch<SetStateAction<string | null>>;
  placing: string | null;
  setPlacing: Dispatch<SetStateAction<string | null>>;
}

/**
 * How long a new block for a task is: what its blocks do not yet cover of the estimate, so a 3 h task split in two
 * gets the second half; the whole estimate when it is covered already, or nearly.
 */
export function nextBlockLength(task: Pick<Task, "estimateMin">, existing: readonly Interval[], defaultEstimateMin: number): number {
  const whole = blockLength(task.estimateMin, defaultEstimateMin);
  const left = snapTo(whole - coveredMinutes(existing));
  return left >= 15 ? left : whole;
}

export function usePlacing(d: PlacingDay) {
  const repo = useBlockRepo();
  const blocking = useBlocking();
  const { data: users } = useQuery<{ id: string; personal_space_id: string | null }>(USER_SQL);
  const [ownSelected, setOwnSelected] = useState<string | null>(null);
  const [ownPlacing, setOwnPlacing] = useState<string | null>(null);
  const selectedBlockId = d.state ? d.state.selectedBlockId : ownSelected;
  const setSelectedBlockId = d.state?.setSelectedBlockId ?? setOwnSelected;
  const placing = d.state ? d.state.placing : ownPlacing;
  const setPlacing = d.state?.setPlacing ?? setOwnPlacing;
  const atMinute = useCallback((minute: number) => instantAt(d.day, d.zone, minute), [d.day, d.zone]);
  const blockOf = (id: string) => d.blocks.find((b) => b.id === id);
  const ofTask = (taskId: string) => d.blocks.filter((b) => b.taskId === taskId);

  const create = async (taskId: string | null, title: string | null, start: number, end: number): Promise<string | null> => {
    const user = users?.[0];
    if (!user?.personal_space_id) return null;
    const id = await repo.create({ spaceId: user.personal_space_id, userId: user.id, taskId, title, startAt: atMinute(start), endAt: atMinute(end) });
    setSelectedBlockId(id);
    return id;
  };
  /** A new block for the task at `startMin` (several blocks per task are allowed, PRODUCT_SPEC.md §10.2). */
  const placeTask = (task: Task, startMin: number) => {
    const at = placeAt(startMin, nextBlockLength(task, ofTask(task.id), d.defaultEstimateMin));
    return create(task.id, task.title, at.start, at.end);
  };
  /** An ad-hoc block, with no task (a lunch, deep work): drawn on empty space, or "New block here". */
  const createAdHoc = (start: number, end: number) => create(null, "Block", start, end);
  /** Moved, keeping its length, snapped to five minutes; a locked block stays put. */
  const moveBlock = (id: string, startMin: number) => {
    const b = blockOf(id);
    if (!b || b.locked) return;
    const at = placeAt(startMin, b.end - b.start);
    if (at.start !== b.start) void repo.move(id, atMinute(at.start), atMinute(at.end));
  };
  /** New edges from either end, or both (the detail's start and end fields). */
  const resizeBlock = (id: string, start: number, end: number) => {
    const b = blockOf(id);
    if (!b || b.locked || end <= start || (start === b.start && end === b.end)) return;
    void repo.move(id, atMinute(start), atMinute(end));
  };
  const duplicateBlock = async (id: string, startMin: number) => {
    const b = blockOf(id);
    if (!b) return;
    const at = placeAt(startMin, b.end - b.start);
    const copy = await repo.duplicate(id, atMinute(at.start), atMinute(at.end));
    if (copy) setSelectedBlockId(copy);
  };
  const removeBlock = (id: string) => {
    setSelectedBlockId((s) => (s === id ? null : s));
    void repo.remove(id);
  };

  // `B`, the palette and the detail's "Block it": what is left of the task, in the next free gap that fits, from now.
  // A task its blocks already cover just has its first block selected.
  const blockInNextGap = (taskId: string) => {
    const task = d.findTask(taskId);
    if (!task) return;
    d.onPlaced?.();
    setPlacing(null);
    const existing = ofTask(task.id);
    const whole = blockLength(task.estimateMin, d.defaultEstimateMin);
    if (existing.length > 0 && whole - coveredMinutes(existing) < 15) {
      setSelectedBlockId(existing[0].id);
      return;
    }
    const slot = chooseSlot(d.free, Math.max(d.nowMinute ?? 0, d.dayStart), nextBlockLength(task, existing, d.defaultEstimateMin), d.dayEnd);
    void placeTask(task, slot.start);
  };
  const blockRef = useRef(blockInNextGap);
  useEffect(() => {
    blockRef.current = blockInNextGap;
  });
  useEffect(() => blocking.register((id) => blockRef.current(id)), [blocking]);

  // Tap-to-schedule (SCREENS.md §2.8): the next tap on the timeline places what is waiting; Escape lets go.
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPlacing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [placing, setPlacing]);
  const tapSlot = (min: number) => {
    const task = placing ? d.findTask(placing) : undefined;
    setPlacing(null);
    if (task) void placeTask(task, min);
  };
  // The task waiting, for the bar over the timeline (gone when the task has left the day).
  const placingTask = placing ? d.findTask(placing) : undefined;

  return {
    repo,
    atMinute,
    selectedBlockId,
    setSelectedBlockId,
    /** The task waiting for a tap on the timeline ("Block…" on a row); its block's own Move… waits in the timeline. */
    placingTask,
    setPlacing,
    tapSlot,
    placeTask,
    createAdHoc,
    moveBlock,
    resizeBlock,
    duplicateBlock,
    removeBlock,
    blockInNextGap,
  };
}

export type PlacingApi = ReturnType<typeof usePlacing>;
