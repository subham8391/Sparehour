"use client";
import { useMemo } from "react";
import { useLocalDatabase } from "@/data/powersync";
import { TaskRepo } from "@/data/repositories/task-repo";

export function useTaskRepo(): TaskRepo {
  const db = useLocalDatabase();
  return useMemo(() => new TaskRepo(db), [db]);
}
