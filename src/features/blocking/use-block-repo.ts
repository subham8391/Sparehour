"use client";
import { useMemo } from "react";
import { useLocalDatabase } from "@/data/powersync";
import { BlockRepo } from "@/data/repositories/block-repo";
import { useUndoSink } from "@/features/undo/undo-provider";

export function useBlockRepo(): BlockRepo {
  const db = useLocalDatabase();
  const undo = useUndoSink();
  return useMemo(() => new BlockRepo(db, undo ?? undefined), [db, undo]);
}
