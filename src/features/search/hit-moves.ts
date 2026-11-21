// What a search result's row offers (SCREENS.md §13: "results use the same rows and swipe actions"): what its
// state's own list offers, and the one undoable write behind each. Its own module, free of the row's web parts
// (hit-actions.tsx draws them in the browser), so the Android app's results offer the same moves and make the same
// writes (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import { compareDates, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { TaskRepo } from "@/data/repositories/task-repo";

export type HitMove = "today" | "tomorrow" | "someday" | "drop" | "reopen" | "restore";

export const HIT_MOVE_LABEL: Record<HitMove, string> = { today: "Today", tomorrow: "Tomorrow", someday: "Someday", drop: "Drop", reopen: "Reopen", restore: "Restore" };

/**
 * The moves by the task's state, in the order they are offered: an Inbox task and a carried-over one take the four
 * moves; a task on today or later only Tomorrow (the ⋯ adds Someday, as on every open row); a Someday one goes to
 * Today or is dropped; a finished one reopens; a dropped one is restored. An archived task offers nothing.
 */
export function hitMoves(task: Pick<Task, "state" | "doDate">, today: LocalDate): HitMove[] {
  switch (task.state) {
    case "inbox":
      return ["today", "tomorrow", "someday", "drop"];
    case "active":
      return task.doDate && compareDates(task.doDate, today) < 0 ? ["today", "tomorrow", "someday", "drop"] : ["tomorrow"];
    case "someday":
      return ["today", "drop"];
    case "done":
      return ["reopen"];
    case "dropped":
      return ["restore"];
    default:
      return [];
  }
}

/** The write a move makes; the repository records its undo. */
export function runHitMove(repo: Pick<TaskRepo, "reschedule" | "setState" | "reopen">, id: string, move: HitMove, today: LocalDate): Promise<unknown> {
  switch (move) {
    case "today":
      return repo.reschedule(id, today);
    case "tomorrow":
      return repo.reschedule(id, today.add({ days: 1 }));
    case "someday":
      return repo.setState(id, "someday");
    case "drop":
      return repo.setState(id, "dropped");
    case "reopen":
      return repo.reopen(id);
    case "restore":
      return repo.setState(id, "active", "Brought back {title}");
  }
}
