"use client";
// Placing blocks on a day (PRODUCT_SPEC.md §10.2, SCREENS.md §2.6, §2.8): where a task's block goes and how long it
// is, `B`'s next free gap, tap-to-schedule and the block's own Move… and Duplicate (a tap on the timeline, or a
// time typed), the ad-hoc blocks drawn on empty space, and the selected block. Shared by Today and the morning
// plan's last step, and written for any day so the Calendar and day stepping can take it as they are.
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@/data/powersync";
import { blockLength, chooseSlot, coveredMinutes, lateSlot, placeAt, snapTo } from "@/core/blocking";
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
  /**
   * The minute it is now when `day` is today, counted on past 1440 once the clock has passed midnight and the day has
   * not rolled over yet (`minuteFromDay`); null on any other day.
   */
  nowMinute: number | null;
  defaultEstimateMin: number;
  findTask: (id: string) => Task | undefined;
  /** Whatever the screen does when a block is placed for it by `B` (Today shows its Day view). */
  onPlaced?: () => void;
  /**
   * Blocking is paused, and why (PRODUCT_SPEC.md §10.3 rule 5: calendar access revoked, or the write calendar gone):
   * no new block is made — not by `B`, a drop, a tap or a copy — while the existing ones can still be edited.
   */
  off?: string | null | false;
  /**
   * The selected block and the task waiting for a tap, when the screen holds them itself: Today keeps them in its
   * shell (a row's "Block…" and Plan my day set them) and runs this hook inside the day pane's island.
   */
  state?: PlacingState;
  /**
   * A task placed here that is planned for another day moves to this one with its block, as one undo step (the
   * Calendar's other days, DECISIONS.md "Calendar rail in week modes"). Left out, the task keeps its day.
   */
  movesTasks?: boolean;
  /** Whether `B` places on this day; false where several days are on screen and another one answers it. Default true. */
  answersB?: boolean;
  /**
   * The open tasks a tap on an empty time offers for the new block ("Add at 14:30", DECISIONS.md, amendment
   * 2026-11-21), in the order the screen lists them. Left out, the sheet asks only for a name.
   */
  tasks?: readonly Task[];
}

/** A task the "Add at" sheet offers: how long its next block would be, and whether the day already has one for it. */
export interface AddableTask {
  id: string;
  title: string;
  minutes: number;
  blocked: boolean;
}

/** What the "Add at" sheet adds: a block for a task, or one of your own under a name. */
export type AddWhat = { taskId: string } | { title: string };

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

  const create = async (task: Task | null, title: string | null, start: number, end: number): Promise<string | null> => {
    if (d.off) return null;
    const user = users?.[0];
    if (!user?.personal_space_id) return null;
    // Past the day's midnight (`B` before the rollover hour): the block is on the next date, where this day's timeline
    // does not draw it, so there is nothing here to select and its toast names the time instead.
    const late = start >= 24 * 60;
    const block = { spaceId: user.personal_space_id, userId: user.id, taskId: task?.id ?? null, title, startAt: atMinute(start), endAt: atMinute(end), ...(late ? { late } : {}) };
    const id = task && d.movesTasks && !task.doDate?.equals(d.day) ? await repo.createOnTaskDay({ ...block, taskId: task.id }, d.day) : await repo.create(block);
    if (!late) setSelectedBlockId(id);
    return id;
  };
  /** A new block for the task at `startMin` (several blocks per task are allowed, PRODUCT_SPEC.md §10.2). */
  const placeTask = (task: Task, startMin: number) => {
    const at = placeAt(startMin, nextBlockLength(task, ofTask(task.id), d.defaultEstimateMin));
    return create(task, task.title, at.start, at.end);
  };
  /** An ad-hoc block, with no task (a lunch, deep work): drawn on empty space, or "New block here". */
  const createAdHoc = (start: number, end: number) => create(null, "Block", start, end);
  /**
   * The "Add at" sheet's choices (a tap on an empty time, then "New block here"): the day's tasks, those without a
   * block here first, each with the length its next block would have.
   */
  const addable: AddableTask[] = (d.tasks ?? [])
    .map((t) => {
      const existing = ofTask(t.id);
      return { id: t.id, title: t.title, minutes: nextBlockLength(t, existing, d.defaultEstimateMin), blocked: existing.length > 0 };
    })
    .sort((a, b) => Number(a.blocked) - Number(b.blocked));
  /** The sheet's Add: a block for the task picked, or one of your own under the name typed, over exactly these minutes. */
  const addAt = (what: AddWhat, start: number, end: number): Promise<string | null> => {
    if ("title" in what) return create(null, what.title.trim() || "Block", start, end);
    const task = d.findTask(what.taskId);
    return task ? create(task, task.title, start, end) : Promise.resolve(null);
  };
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
    if (!b || d.off) return;
    const at = placeAt(startMin, b.end - b.start);
    const copy = await repo.duplicate(id, atMinute(at.start), atMinute(at.end));
    if (copy) setSelectedBlockId(copy);
  };
  const removeBlock = (id: string) => {
    setSelectedBlockId((s) => (s === id ? null : s));
    void repo.remove(id);
  };

  // `B`, the palette and the detail's "Block it": what is left of the task, in the next free gap that fits, from now.
  // A task its blocks already cover just has its first block selected. Past midnight on a day that has not rolled
  // over yet, the day's own hours are all behind: the block goes at the time it is, on the next date.
  const blockInNextGap = (taskId: string) => {
    const task = d.findTask(taskId);
    if (!task) return;
    setPlacing(null);
    const existing = ofTask(task.id);
    const whole = blockLength(task.estimateMin, d.defaultEstimateMin);
    const covered = existing.length > 0 && whole - coveredMinutes(existing) < 15;
    const length = nextBlockLength(task, existing, d.defaultEstimateMin);
    const late = covered ? null : lateSlot(d.nowMinute ?? 0, length);
    // The screen shows this day's timeline for what is made or selected on it; a block past midnight is not there.
    if (!late) d.onPlaced?.();
    if (covered) {
      setSelectedBlockId(existing[0].id);
      return;
    }
    if (late) {
      void create(task, task.title, late.start, late.end);
      return;
    }
    const slot = chooseSlot(d.free, Math.max(d.nowMinute ?? 0, d.dayStart), length, d.dayEnd);
    void placeTask(task, slot.start);
  };
  const blockRef = useRef(blockInNextGap);
  useEffect(() => {
    blockRef.current = blockInNextGap;
  });
  const answersB = d.answersB !== false;
  useEffect(() => (answersB ? blocking.register((id) => blockRef.current(id)) : undefined), [blocking, answersB]);

  // Tap-to-schedule (SCREENS.md §2.8): the next tap on the timeline places what is waiting; Escape lets go.
  useEffect(() => {
    // Where there is no keyboard to listen to (the Android app), Cancel on the bar is the way to let go.
    if (!placing || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
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
    /** Whether a block can be written yet: the account's row has been read (a pane just mounted has not). */
    ready: Boolean(users?.[0]?.personal_space_id),
    atMinute,
    selectedBlockId,
    setSelectedBlockId,
    /** The task waiting for a tap on the timeline ("Block…" on a row); its block's own Move… waits in the timeline. */
    placingTask,
    setPlacing,
    tapSlot,
    placeTask,
    createAdHoc,
    addable,
    addAt,
    moveBlock,
    resizeBlock,
    duplicateBlock,
    removeBlock,
    blockInNextGap,
  };
}

export type PlacingApi = ReturnType<typeof usePlacing>;
