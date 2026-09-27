// The morning review of carried-over tasks (SCREENS.md §2.3a; DECISIONS.md
// carry-over ruling, amended 2026-09-27). Carry-over stays automatic
// overnight; the first open of a new day asks, once, what to do with each
// task that came along. This module is the rules: when to ask, what the sheet
// says, and what each answer writes. Pure apart from the repository handed to
// `applyChoices`.
import { localDate, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { TaskPatch } from "@/data/repositories/task-repo";
import type { SyncChipState } from "@/features/shell/sync-chip";

export interface ReviewInput {
  /** Settings › Planning › "Morning review". */
  enabled: boolean;
  /** How many tasks are carried over today. */
  carried: number;
  /** The sync chip's state: the review waits for the first sync so a fresh device never asks about a stale list. */
  syncState: SyncChipState;
  pathname: string;
  /** Today's day_plans row, or null when there is none yet. */
  today: { carryReviewedAt: string | null; plannedAt: string | null } | null;
  /** Yesterday's row, or null. */
  yesterday: { shutdownAt: string | null } | null;
}

const RITUAL_ROUTE = /^\/(plan|shutdown)(\/|$)/;

/**
 * True only when the review is on, there is something to review, the sync has
 * settled, a ritual is not already open, today has neither been reviewed nor
 * planned, and yesterday was not closed by the evening shutdown. A person who
 * decided in the evening, or already planned this morning, is never asked twice.
 */
export function shouldReview(i: ReviewInput): boolean {
  if (!i.enabled || i.carried === 0) return false;
  if (i.syncState === "connecting" || i.syncState === "syncing") return false;
  if (RITUAL_ROUTE.test(i.pathname)) return false;
  if (i.today?.carryReviewedAt || i.today?.plannedAt) return false;
  if (i.yesterday?.shutdownAt) return false;
  return true;
}

const things = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;

/** "3 things didn’t happen yesterday." when every carried task was due yesterday; "3 things are still waiting." otherwise. */
export function reviewLine(n: number, allFromYesterday: boolean): string {
  if (allFromYesterday) return `${things(n)} didn${"’"}t happen yesterday.`;
  return `${things(n)} ${n === 1 ? "is" : "are"} still waiting.`;
}

/** Whether every carried task was due yesterday, so the heading can say so. */
export function allFromYesterday(tasks: readonly Pick<Task, "doDate">[], today: LocalDate): boolean {
  const yesterday = today.subtract({ days: 1 });
  return tasks.length > 0 && tasks.every((t) => t.doDate !== null && t.doDate.equals(yesterday));
}

/** What a person decides for one carried task; a chosen day is any other date. */
export type Choice = "keep" | "tomorrow" | "someday" | "drop" | { day: LocalDate };

/** Keep is the default: a no-penalty yes must always exist (DECISIONS.md). */
export const DEFAULT_CHOICE: Choice = "keep";

/** The task writes the review needs. `TaskRepo` satisfies it; tests hand in a fake. */
export interface ChoiceRepo {
  reschedule(id: string, doDate: LocalDate | null): Promise<void>;
  updateMany(ids: readonly string[], patch: TaskPatch, note?: string): Promise<void>;
  setState(id: string, state: "someday" | "dropped"): Promise<void>;
  setStateMany(ids: readonly string[], state: "someday" | "dropped"): Promise<void>;
}

/**
 * Applies the choices. Keep is exactly what the carried-over row's "Keep
 * today" does (a reschedule to today); Tomorrow and a picked day are the same
 * move to that day; Someday and Drop set the state, which also resets the
 * carry count. Tasks that share an answer go through the repository's batch
 * writes, so one Done is one undo per answer, and the toast names the batch.
 */
export async function applyChoices(repo: ChoiceRepo, choices: ReadonlyMap<string, Choice>, today: LocalDate): Promise<void> {
  const keep: string[] = [];
  const tomorrow: string[] = [];
  const someday: string[] = [];
  const drop: string[] = [];
  const days = new Map<string, string[]>();
  for (const [id, choice] of choices) {
    if (choice === "keep") keep.push(id);
    else if (choice === "tomorrow") tomorrow.push(id);
    else if (choice === "someday") someday.push(id);
    else if (choice === "drop") drop.push(id);
    else {
      const iso = choice.day.toString();
      days.set(iso, [...(days.get(iso) ?? []), id]);
    }
  }
  const move = async (ids: readonly string[], day: LocalDate, note: string) => {
    if (ids.length === 0) return;
    if (ids.length === 1) await repo.reschedule(ids[0], day);
    else await repo.updateMany(ids, { doDate: day }, note);
  };
  const set = async (ids: readonly string[], state: "someday" | "dropped") => {
    if (ids.length === 0) return;
    if (ids.length === 1) await repo.setState(ids[0], state);
    else await repo.setStateMany(ids, state);
  };
  await move(keep, today, "Moved {title} to today");
  await move(tomorrow, today.add({ days: 1 }), "Moved {title} to tomorrow");
  for (const iso of [...days.keys()].sort()) await move(days.get(iso) as string[], localDate(iso), "Moved {title}");
  await set(someday, "someday");
  await set(drop, "dropped");
}
