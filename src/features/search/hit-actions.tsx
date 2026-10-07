"use client";
// A search result's row actions (SCREENS.md §13: "results use the same rows and swipe actions"): what its state's
// own list offers, so the hover zone, the ⋯ and the swipes (swipe.ts) match that list. Each is one undoable write.
import { compareDates, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { MoveActions, RowAction } from "@/features/tasks/task-actions";
import { useTaskRepo } from "@/features/tasks/use-task-repo";

export function HitActions({ task, today }: { task: Pick<Task, "id" | "state" | "doDate">; today: LocalDate }) {
  const repo = useTaskRepo();
  const id = task.id;
  const to = (day: LocalDate) => () => void repo.reschedule(id, day);
  const set = (state: "someday" | "dropped" | "active", note?: string) => () => void repo.setState(id, state, note);
  const tomorrow = today.add({ days: 1 });
  switch (task.state) {
    case "inbox":
      return <MoveActions onToday={to(today)} onTomorrow={to(tomorrow)} onSomeday={set("someday")} onDrop={set("dropped")} />;
    case "active":
      // Carried over: the four moves; otherwise Tomorrow (the ⋯ adds Someday, as on every open row).
      return task.doDate && compareDates(task.doDate, today) < 0 ? (
        <MoveActions onToday={to(today)} onTomorrow={to(tomorrow)} onSomeday={set("someday")} onDrop={set("dropped")} />
      ) : (
        <RowAction label="Tomorrow" icon="arrow-right" title="Tomorrow (Shift+T)" onClick={to(tomorrow)} />
      );
    case "someday":
      return (
        <>
          <RowAction label="Today" primary title="Today (T)" onClick={to(today)} />
          <RowAction label="Drop" title="Drop (Backspace)" onClick={set("dropped")} />
        </>
      );
    case "done":
      return <RowAction label="Reopen" primary title="Reopen (U)" onClick={() => void repo.reopen(id)} />;
    case "dropped":
      return <RowAction label="Restore" primary onClick={set("active", "Brought back {title}")} />;
    default:
      return null;
  }
}
