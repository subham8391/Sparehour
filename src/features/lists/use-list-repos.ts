"use client";
// The Lists repositories wired to the undo stack, as features/tasks/use-repos.ts wires the others. Kept apart from it:
// ListItemRepo brings TaskRepo ("Turn into a task"), and only the Lists screens need either.
import { useMemo } from "react";
import { useLocalDatabase } from "@/data/powersync";
import { ListItemRepo } from "@/data/repositories/list-item-repo";
import { ListRepo } from "@/data/repositories/list-repo";
import { useUndoSink } from "@/features/undo/undo-provider";

export function useListRepos(): { lists: ListRepo; items: ListItemRepo } {
  const db = useLocalDatabase();
  const undo = useUndoSink();
  return useMemo(() => ({ lists: new ListRepo(db, undo ?? undefined), items: new ListItemRepo(db, undo ?? undefined) }), [db, undo]);
}
