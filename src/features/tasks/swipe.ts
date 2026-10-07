// Swipe actions on a phone row (DESIGN_SYSTEM.md §5 Task row: "right = advance, left = push away; Drop never on a
// full swipe"; SCREENS.md §2.8, §5, §7, §8, §13, §22; DECISIONS.md, M1 gap rulings "Swipes on Someday and the
// Logbook"). Pure: which actions each side offers for a task, and how a finger's travel is read. The gesture itself
// (swipe-layer.tsx) is a lazy island that runs these, so no shell carries them.
import { compareDates, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";

/** The finger moved right (the row slides right, the actions show at its left edge) or left. */
export type SwipeSide = "right" | "left";

/** The ring's action, named as the ⋯ names it. */
export const COMPLETE = "Complete";

/** Actions that only ever run from a tap on their revealed button, never from a full swipe. */
export const TAP_ONLY: ReadonlySet<string> = new Set(["Drop"]);

export interface SwipePlan {
  /** Advance: the first one is what a full swipe runs. */
  right: readonly string[];
  /** Push away: the first one is what a full swipe runs, unless it is tap-only. */
  left: readonly string[];
}

const NONE: SwipePlan = { right: [], left: [] };

/**
 * The labels each side offers, by the row's state (search rows follow theirs): a Today row completes or moves to
 * Tomorrow · Someday (Someday alone once it is planned for tomorrow), a carried-over one goes to Today · Tomorrow or Someday · Drop, an Inbox one to Today or
 * Someday, a Someday one to Today or (by a tap) Drop, a finished one reopens, a dropped one is restored. A view
 * offers only those of them its row's ⋯ holds, so every swipe is also a tap away.
 */
export function swipePlan(task: Pick<Task, "state" | "doDate">, today: LocalDate): SwipePlan {
  switch (task.state) {
    case "inbox":
      return { right: ["Today"], left: ["Someday"] };
    case "someday":
      return { right: ["Today"], left: ["Drop"] };
    case "done":
      return { right: ["Reopen"], left: [] };
    case "dropped":
      return { right: ["Restore"], left: [] };
    case "active":
      if (task.doDate && compareDates(task.doDate, today) < 0) return { right: ["Today", "Tomorrow"], left: ["Someday", "Drop"] };
      // A row already planned for tomorrow has nothing to push to there: only Someday.
      return { right: [COMPLETE], left: task.doDate && compareDates(task.doDate, today.add({ days: 1 })) === 0 ? ["Someday"] : ["Tomorrow", "Someday"] };
    default:
      return NONE;
  }
}

/** How far a finger travels before its direction counts: less is a tap or a long-press settling. */
export const SLOP = 10;
/** Sideways wins only when the travel is this much more across than down (an angle under about 34°). */
export const LOCK = 1.5;
/** Each revealed button's width. */
export const BUTTON_W = 76;

export type Axis = "pending" | "x" | "y";

/** Which way a gesture goes, from its travel so far: undecided inside the slop, else across or down (a scroll). */
export function classify(dx: number, dy: number): Axis {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SLOP && ay < SLOP) return "pending";
  return ax > ay * LOCK ? "x" : "y";
}

/** The travel past which letting go runs the side's first action: over half the row, and never under 160 px. */
export function commitAt(width: number): number {
  return Math.max(width * 0.55, 160);
}

/**
 * What letting go does after `dx` of sideways travel across a row `width` wide, with `count` actions on that side:
 * spring back, stay open on the buttons, or run the first action (a full swipe) when it may run that way.
 */
export function release(dx: number, width: number, count: number, fullOk: boolean): "close" | "open" | "commit" {
  const ax = Math.abs(dx);
  if (count === 0) return "close";
  if (fullOk && ax >= commitAt(width)) return "commit";
  return ax >= Math.min(BUTTON_W * 0.6, (BUTTON_W * count) / 2) ? "open" : "close";
}
