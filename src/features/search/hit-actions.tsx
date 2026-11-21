"use client";
// A search result's row actions (SCREENS.md §13: "results use the same rows and swipe actions"): what its state's
// own list offers, so the hover zone, the ⋯ and the swipes (swipe.ts) match that list. Each is one undoable write.
// Which moves, and the write behind each, are hit-moves.ts; this draws them.
import type { LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { MoveActions, RowAction } from "@/features/tasks/task-actions";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { hitMoves, runHitMove, type HitMove } from "./hit-moves";

export function HitActions({ task, today }: { task: Pick<Task, "id" | "state" | "doDate">; today: LocalDate }) {
  const repo = useTaskRepo();
  const moves = hitMoves(task, today);
  const run = (move: HitMove) => () => void runHitMove(repo, task.id, move, today);
  const on = (move: HitMove) => (moves.includes(move) ? run(move) : undefined);
  if (moves.length === 0) return null;
  if (moves[0] === "reopen") return <RowAction label="Reopen" primary title="Reopen (U)" onClick={run("reopen")} />;
  if (moves[0] === "restore") return <RowAction label="Restore" primary onClick={run("restore")} />;
  // On today or later: Tomorrow alone (the ⋯ adds Someday, as on every open row).
  if (moves.length === 1 && moves[0] === "tomorrow") return <RowAction label="Tomorrow" icon="arrow-right" title="Tomorrow (Shift+T)" onClick={run("tomorrow")} />;
  // The Inbox's and a carried-over task's four moves; Someday's Today and Drop.
  return <MoveActions onToday={on("today")} onTomorrow={on("tomorrow")} onSomeday={on("someday")} onDrop={on("drop")} />;
}
