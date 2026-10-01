"use client";
// Step 2 of the evening shutdown, wired to the day (SCREENS.md §15). The
// unfinished list is frozen the first time it arrives, as the morning plan
// freezes its groups, so a row stays put once it is answered and shows what
// became of it; the outcome is read back from the task's live row, so the
// toast's Undo puts a row back to waiting. "Move all to tomorrow" is one
// statement and one undo entry for every row still waiting.
import { useMemo, useState } from "react";
import { useQuery } from "@/data/powersync";
import { localDate, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { toTask } from "@/data/mappers";
import { TASKS_THROUGH_TODAY_SQL } from "@/data/queries/today";
import type { TaskRepo } from "@/data/repositories/task-repo";
import type { TaskRow } from "@/data/schema.client";
import { carryOutcome, type CarryChoice, type CarryRow } from "./shutdown";

const NOTHING_SQL = `select * from tasks where 0`;
/** The frozen rows as they are now, in any state, so each can say what became of it. */
const liveRowsSql = (n: number) => `select * from tasks where deleted_at is null and id in (${Array.from({ length: n }, () => "?").join(", ")})`;

export interface ShutdownCarry {
  /** False until the unfinished list has been read and frozen. */
  ready: boolean;
  rows: CarryRow[];
  carry: (id: string, to: CarryChoice) => void;
  /** Every row still waiting goes to tomorrow in one statement, with one toast and one undo. */
  carryAll: () => void;
}

export function useShutdownCarry({
  today,
  dayKnown,
  settled,
  tasks,
}: {
  today: LocalDate;
  /** The person's settings are in, so `today` is their day and not a guess in UTC. */
  dayKnown: boolean;
  /** The first sync has landed (or cannot): an empty list then means there is nothing unfinished, not "not here yet". */
  settled: boolean;
  tasks: Pick<TaskRepo, "reschedule" | "setState" | "updateMany">;
}): ShutdownCarry {
  const todayIso = today.toString();
  const { data: openRows, isLoading } = useQuery<TaskRow>(TASKS_THROUGH_TODAY_SQL, [todayIso, todayIso]);
  // Evening tasks have their own time after work; the shutdown leaves them be.
  const unfinished = useMemo(() => (openRows ?? []).map(toTask).filter((t) => !t.evening), [openRows]);
  const [frozen, setFrozen] = useState<Task[] | null>(null);
  if (!frozen && dayKnown && !isLoading && (unfinished.length > 0 || settled)) setFrozen(unfinished);

  const ids = useMemo(() => (frozen ?? []).map((t) => t.id), [frozen]);
  const { data: liveRows } = useQuery<TaskRow>(ids.length > 0 ? liveRowsSql(ids.length) : NOTHING_SQL, ids);
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set());

  const rows = useMemo<CarryRow[]>(() => {
    const day = localDate(todayIso);
    const live = new Map((liveRows ?? []).map((r) => [r.id, toTask(r)]));
    return (frozen ?? []).map((t) => ({ task: live.get(t.id) ?? t, outcome: carryOutcome(live.get(t.id), day, kept.has(t.id)) }));
  }, [frozen, liveRows, kept, todayIso]);

  const tomorrow = today.add({ days: 1 });
  const carry = (id: string, to: CarryChoice) => {
    setKept((s) => {
      const next = new Set(s);
      if (to === "keep") next.add(id);
      else next.delete(id);
      return next;
    });
    // Keep for today writes nothing: the task is already on today, and the row is answered.
    if (to === "tomorrow") void tasks.reschedule(id, tomorrow);
    else if (to === "someday") void tasks.setState(id, "someday");
    else if (to === "drop") void tasks.setState(id, "dropped");
  };
  const carryAll = () => {
    const waiting = rows.filter((r) => r.outcome === null).map((r) => r.task.id);
    if (waiting.length > 0) void tasks.updateMany(waiting, { doDate: tomorrow }, "Moved {title} to tomorrow");
  };

  return { ready: frozen !== null, rows, carry, carryAll };
}
