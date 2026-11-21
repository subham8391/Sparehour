// Today's list as one run of rows for the phone's list view. Its own file, free of the screen, so it is tested plainly.
import type { Task } from "@/core/types";

export type Row = { kind: "header"; key: string; label: string; count: number } | { kind: "task"; key: string; task: Task; carried: boolean };

/** Carried over, then the day, then this evening; a section with nothing in it is left out. */
export function todayRows(carried: readonly Task[], day: readonly Task[], evening: readonly Task[]): Row[] {
  const rows: Row[] = [];
  const section = (label: string, tasks: readonly Task[], isCarried: boolean) => {
    if (tasks.length === 0) return;
    rows.push({ kind: "header", key: `h-${label}`, label, count: tasks.length });
    for (const task of tasks) rows.push({ kind: "task", key: task.id, task, carried: isCarried });
  };
  section("Carried over", carried, true);
  section("Today", day, false);
  section("This evening", evening, false);
  return rows;
}
