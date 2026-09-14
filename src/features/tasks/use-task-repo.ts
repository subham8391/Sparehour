"use client";
import { useMemo } from "react";
import { useLocalDatabase } from "@/data/powersync";
import { TaskRepo } from "@/data/repositories/task-repo";
import { useUndoSink } from "@/features/undo/undo-provider";

export function useTaskRepo(): TaskRepo {
  const db = useLocalDatabase();
  const undo = useUndoSink();
  return useMemo(() => new TaskRepo(db, undo ?? undefined), [db, undo]);
}
