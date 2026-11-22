// What a notification's action does (SYSTEM_DESIGN.md §7.1, §7.3), apart from how an app draws or routes it: the
// writes each action makes, whether a linked task is on this device, and the action sheet's titles. Shared by the
// web's push-actions.tsx and the Android app (mobile/src/push), so a button does the same thing on both. No DOM, no
// React, no router: each caller hands in its own way to open a task and to go to a page.
import type { LocalDate } from "@/core/time";
import type { BlockRepo } from "@/data/repositories/block-repo";
import type { TaskRepo } from "@/data/repositories/task-repo";
import type { PushAction } from "./actions";
import type { DeepLink } from "./push";

export const SNOOZE_MS = 15 * 60 * 1000;
/** How long a device still on its first sync is given before a link says its task isn't here. */
export const FIRST_SYNC_WAIT_MS = 8000;
export const NOT_HERE = "That task isn’t on this device.";
const TASK_HERE_SQL = `select id from tasks where id = ? and deleted_at is null`;
const BLOCK_TIMES_SQL = `select start_at, end_at from time_blocks where id = ? and deleted_at is null`;

/** What the lookup needs of the local database. */
export interface TaskLookup {
  getOptional: (sql: string, params: string[]) => Promise<unknown>;
  waitForFirstSync: (request: { priority: number; signal: AbortSignal }) => Promise<void>;
  currentStatus?: { hasSynced?: boolean };
}

/**
 * Whether the task is on this device. One that is not yet may only be waiting for the first sync after a sign-in:
 * that is given a few seconds, never longer, so the link always answers.
 */
export async function taskOnDevice(db: TaskLookup, id: string, waitMs = FIRST_SYNC_WAIT_MS): Promise<boolean> {
  const here = async () => Boolean(await db.getOptional(TASK_HERE_SQL, [id]));
  if (await here()) return true;
  if (db.currentStatus?.hasSynced) return false;
  // Priority 1 is the working set (supabase/powersync/streams.yaml); the wait is let go of either way.
  const stop = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([db.waitForFirstSync({ priority: 1, signal: stop.signal }), new Promise((resolve) => (timer = setTimeout(resolve, waitMs)))]);
  } catch {
    // no sync to wait for: answer from what is here
  } finally {
    clearTimeout(timer);
    stop.abort();
  }
  return here();
}

/** What carrying out an action needs from the app it runs in. */
export interface PushActionPorts {
  /** Reads a block's times (the local database). */
  db: { getOptional: <T>(sql: string, params: string[]) => Promise<T | null> };
  tasks: Pick<TaskRepo, "update">;
  blocks: Pick<BlockRepo, "move">;
  /** The person's today (their zone and rollover hour). */
  today: LocalDate;
  /** Opens a task's detail. */
  openTask: (id: string) => void;
  /** Goes to one of the app's pages. */
  go: (page: "/plan" | "/shutdown") => void;
}

/** Carries out a notification's action against the local database. */
export async function carryOutPushAction(link: DeepLink, action: PushAction, p: PushActionPorts): Promise<void> {
  switch (action) {
    case "start":
      if (link.taskId) p.openTask(link.taskId);
      return;
    case "snooze": {
      if (!link.blockId) return;
      const row = await p.db.getOptional<{ start_at: string; end_at: string }>(BLOCK_TIMES_SQL, [link.blockId]);
      if (!row) return;
      const shift = (iso: string) => new Date(new Date(iso).getTime() + SNOOZE_MS).toISOString();
      await p.blocks.move(link.blockId, shift(row.start_at), shift(row.end_at));
      return;
    }
    case "today":
      if (link.taskId) await p.tasks.update(link.taskId, { doDate: p.today, doTime: null, evening: false }, "Moved {title} to today");
      return;
    case "tomorrow":
      if (link.taskId) await p.tasks.update(link.taskId, { doDate: p.today.add({ days: 1 }), doTime: null, evening: false }, "Moved {title} to tomorrow");
      return;
    case "plan":
      p.go("/plan");
      return;
    case "shutdown":
      p.go("/shutdown");
      return;
    case "dismiss":
      return;
  }
}

/** The action sheet's title for each kind: what a plain tap on the notification opens with. */
export const SHEET_TITLES: Record<DeepLink["kind"], string> = {
  block_start: "Your block is starting.",
  deadline_eve: "Due tomorrow.",
  deadline_day: "Due today.",
  morning: "Good morning.",
  shutdown: "Wrapping up?",
};
